#!/bin/sh
set -eu
endpoint="http://floci:4566"
attempt=0
until aws --endpoint-url "$endpoint" s3api list-buckets >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo "Local storage did not become ready" >&2; exit 1; fi
  sleep 2
done
if ! aws --endpoint-url "$endpoint" s3api head-bucket --bucket "$S3_BUCKET" >/dev/null 2>&1; then
  aws --endpoint-url "$endpoint" s3api create-bucket --bucket "$S3_BUCKET" >/dev/null
fi
# No bucket policy or public ACL: objects stay private in the application contract.
aws --endpoint-url "$endpoint" s3api put-bucket-cors --bucket "$S3_BUCKET" --cors-configuration "{\"CORSRules\":[{\"AllowedOrigins\":[\"$WEB_ORIGIN\"],\"AllowedMethods\":[\"PUT\",\"GET\",\"HEAD\"],\"AllowedHeaders\":[\"*\"],\"ExposeHeaders\":[\"ETag\"],\"MaxAgeSeconds\":300}]}"
echo "Local storage bucket and browser CORS configured"
