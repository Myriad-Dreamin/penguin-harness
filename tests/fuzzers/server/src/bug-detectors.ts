/**
 * Let this process's own loopback listener through Jazzer.js's SSRF detector.
 *
 * Jazzer.js installs bug detectors alongside the fuzzer, and the SSRF one hooks every TCP
 * connect from the process. The harness needs exactly one of those: its own server, on an
 * ephemeral port, reached over `http://localhost:<port>` by the CLI leg and by the boot's SSE
 * sample. Everything else still goes through the detector — which is the point: a connection
 * the product opens to anything but its own loopback listener is an SSRF finding.
 *
 * The port is only known after the app boots, so this runs then. Outside Jazzer.js (the
 * `--self-check` replay) the package is not installed and there is nothing to configure.
 */
export async function permitLoopback(port: number): Promise<void> {
  try {
    const { getBugDetectorConfiguration } = await import("@jazzer.js/bug-detectors");
    getBugDetectorConfiguration("ssrf")?.addPermittedTCPConnection("localhost", port);
  } catch {
    // No Jazzer.js in this process: the self-check replay has nothing to permit.
  }
}
