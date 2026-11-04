"""Strict normalization over Meta's pinned public parser, not a guessed codec."""
import re
from uuid import UUID

from meta_sam_parser import (
    CompletedOutcome, SegmentationBoxRecord, SegmentationMaskRecord,
    decode_mask_to_raster, image_segmentation_format, video_segmentation_format,
)

from .types import MaskRaster, MediaRef, ProviderUsage, SegmentObservation, SegmentResult


class ProviderFailure(Exception):
    """Safe stable code only: never include provider output or media references."""
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


MAX_OUTPUT_BYTES = 4 * 1024 * 1024
MAX_MASK_PIXELS = 1280 * 1280
MAX_TOTAL_MASK_PIXELS = 16 * 1024 * 1024
MAX_RECORDS = 16000
_BOX = re.compile(r"<\|box;([^|]*)\|>")
_MASK = re.compile(r"<\|mask;([^|]*)\|>")


def _fields(body: str) -> dict[str, str]:
    items = body.split(";")
    result: dict[str, str] = {}
    for item in items:
        key, separator, value = item.partition("=")
        if not separator or key in result:
            raise ProviderFailure("malformed_record")
        result[key] = value
    return result


def _preflight(output: str, media: MediaRef) -> None:
    if len(output.encode("utf-8")) > MAX_OUTPUT_BYTES:
        raise ProviderFailure("output_limit")
    boxes = list(_BOX.finditer(output))
    masks = list(_MASK.finditer(output))
    if len(boxes) > MAX_RECORDS or len(masks) > MAX_RECORDS:
        raise ProviderFailure("output_limit")
    try:
        for token in boxes:
            fields = _fields(token.group(1))
            if (int(fields["w"]), int(fields["h"])) != media.display_size:
                raise ProviderFailure("source_dimensions_mismatch")
        total_area = 0
        for token in masks:
            fields = _fields(token.group(1))
            height, width, _ = fields["data"].split(",", 2)
            area = int(height) * int(width)
            if int(height) <= 0 or int(width) <= 0 or area > MAX_MASK_PIXELS:
                raise ProviderFailure("mask_limit")
            total_area += area
            if total_area > MAX_TOTAL_MASK_PIXELS:
                raise ProviderFailure("mask_limit")
    except (KeyError, ValueError) as error:
        raise ProviderFailure("malformed_record") from None


def normalize_output(
    output: str, media: MediaRef, prompt_id: str, request_id: UUID,
    *, usage: ProviderUsage, provenance: str = "synthetic", completed: bool = True,
) -> SegmentResult:
    if not completed:
        raise ProviderFailure("incomplete_response")
    _preflight(output, media)
    format_ = image_segmentation_format if media.kind == "image" else video_segmentation_format
    parser = format_().create_parser()
    try:
        parser.push(output)
        parsed = parser.finish(CompletedOutcome()).result
    except Exception:
        raise ProviderFailure("parser_error") from None
    # The upstream parser is permissive: a bad line can coexist with success.
    # Reject all diagnostics so dropped candidates cannot silently look clean.
    if parsed.diagnostics:
        raise ProviderFailure("invalid_segmentation")
    frames = {frame.frame_index: frame for frame in media.frames}
    boxes: dict[tuple[int, str], SegmentationBoxRecord] = {}
    masks: dict[tuple[int, str], SegmentationMaskRecord] = {}
    for record in parsed.records:
        if not isinstance(record, (SegmentationBoxRecord, SegmentationMaskRecord)):
            raise ProviderFailure("unexpected_output_text")
        index = record.frame.frame_index if record.frame is not None else 0
        if index not in frames:
            raise ProviderFailure("unknown_source_frame")
        if not record.object_id.isascii() or not record.object_id.isdigit() or len(record.object_id) > 128:
            raise ProviderFailure("invalid_track_id")
        key = (index, record.object_id)
        target = boxes if isinstance(record, SegmentationBoxRecord) else masks
        if key in target:
            raise ProviderFailure("duplicate_frame_object")
        target[key] = record
    if boxes.keys() != masks.keys():
        raise ProviderFailure("unpaired_geometry")
    width, height = media.display_size
    observations: list[SegmentObservation] = []
    for key in sorted(boxes, key=lambda pair: (pair[0], int(pair[1]))):
        box, mask = boxes[key], masks[key]
        frame = frames[key[0]]
        if box.confidence != mask.confidence:
            raise ProviderFailure("confidence_mismatch")
        bounds = mask.bounds
        if (bounds.left, bounds.top, bounds.right, bounds.bottom) != (box.left, box.top, box.right, box.bottom):
            raise ProviderFailure("mask_alignment_mismatch")
        # This slice supports exact box-local pixels only. Never silently stretch
        # a differently sized mask onto a box or substitute another frame.
        if (mask.mask.width, mask.mask.height) != (box.right - box.left, box.bottom - box.top):
            raise ProviderFailure("mask_alignment_mismatch")
        try:
            raster = decode_mask_to_raster(mask.mask)
            observation = SegmentObservation(
                track_id=key[1], frame_index=key[0], frame_key=frame.frame_key,
                timestamp_ms=frame.timestamp_ms, frame_width=width, frame_height=height,
                bbox={"x": box.left / width, "y": box.top / height,
                      "w": (box.right - box.left) / width, "h": (box.bottom - box.top) / height},
                mask=MaskRaster(width=mask.mask.width, height=mask.mask.height, pixels=raster),
                confidence=box.confidence,
            )
        except Exception:
            raise ProviderFailure("invalid_geometry") from None
        observations.append(observation)
    counts: dict[int, int] = {}
    for index, _ in boxes:
        counts[index] = counts.get(index, 0) + 1
    limits = ("documented_video_track_cap_reached",) if media.kind == "video" and any(
        count >= 16 for count in counts.values()
    ) else ()
    return SegmentResult(request_id=request_id, prompt_id=prompt_id, provenance=provenance,
                         observations=tuple(observations), usage=usage, limits_encountered=limits)
