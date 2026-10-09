/**
 * Cloud Function fetch test
 * Route: GET /node-app/api/fetch-test
 *
 * Calls a public URL so pages-cloud-functions-egress-bandwidth can be verified:
 *   unrestricted → ok:true + remote status
 *   restricted   → ok:false, restricted:true, code OUTBOUND_RESTRICTED
 */
const TARGET = "https://example.com/";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async function onRequest(context) {
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  try {
    const res = await fetch(TARGET, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
    });
    const text = await res.text();
    return json({
      ok: true,
      restricted: false,
      target: TARGET,
      remoteStatus: res.status,
      remoteContentType: res.headers.get("content-type"),
      bodyPreview: text.slice(0, 200),
      elapsedMs: Date.now() - started,
      requestId: context.uuid,
    });
  } catch (err) {
    const message = err?.message || String(err);
    const code = err?.code || "";
    const restricted =
      code === "OUTBOUND_RESTRICTED" || /OUTBOUND_RESTRICTED/i.test(message);
    return json(
      {
        ok: false,
        restricted,
        target: TARGET,
        error: message,
        code: code || undefined,
        elapsedMs: Date.now() - started,
        requestId: context.uuid,
      },
      restricted ? 403 : 502,
    );
  } finally {
    clearTimeout(timer);
  }
}
