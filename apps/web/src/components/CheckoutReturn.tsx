import type { ReactElement } from 'react';

/**
 * Where the payment provider sends the browser afterwards. This page deliberately reads nothing from the
 * address (no `result=success` or any other query value) and calls no API: browser navigation is not payment
 * evidence. Payment state comes only from the provider's verified notification to our server.
 */
export function CheckoutReturn(): ReactElement {
  return (
    <section aria-labelledby="return-heading" className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 id="return-heading" className="text-xl font-semibold">Returned from checkout</h2>
      <p className="text-sm leading-relaxed text-stone-800">
        This page cannot tell whether a payment went through. Payment is confirmed by our payment provider's notification to our server, never by opening this page.
        If you completed checkout, your full report unlocks once that confirmation is verified, which can take a short while. If you cancelled, you can go back and start again.
      </p>
      <p className="text-sm leading-relaxed text-stone-700">
        This build does not show unlock status on this page. Return to your session in this same browser tab, then open your report to see whether it is unlocked.
      </p>
      <a className="btn-primary" href="/">Back to your session</a>
    </section>
  );
}
