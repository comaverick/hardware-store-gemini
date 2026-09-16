import { useState, useEffect } from "react";
import { CheckCircle, Info, WarningCircle } from "@phosphor-icons/react";
import PartialScanScene from "./PartialScanScene";
import { downloadDepthCapture } from "../core/captureDebug";
import { downloadScan } from "../core/partialScanFile";

export default function PartialScanReview({
  scan,
  onUpdateScan,
  onCompleteManually,
  onRescan,
  onDone,
}) {
  const [currentScan, setCurrentScan] = useState(scan);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    setCurrentScan(scan);
  }, [scan]);
  return (
    <section className="ss-partial-review">
      <header>
        <span className="ss-kicker">Scan result</span>
        <h2>Your captured scan.</h2>
        <p>
          This view is built from the camera colors and depth points that were
          actually captured. Missing areas remain open instead of becoming
          generated walls.
        </p>
      </header>

      {scan.measuredReviewWarning ? (
        <div className="ss-notice ss-notice--warning" role="status">
          <div className="ss-notice-title">
            <WarningCircle size={17} weight="fill" aria-hidden="true" />
            <strong>Automatic checks found possible scan issues</strong>
          </div>
          <p>
            This is still the real measured mesh. Inspect it before accepting;
            ScanSpace did not add replacement wall geometry.
          </p>
          <ul>
            {scan.measuredReviewWarning.issues?.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : scan.measuredGapWarning ? (
        <div className="ss-notice ss-notice--warning" role="status">
          <div className="ss-notice-title">
            <WarningCircle size={17} weight="fill" aria-hidden="true" />
            <strong>Some areas remain unmeasured</strong>
          </div>
          <p>
            Some regions did not provide reliable depth and remain open in this
            result. ScanSpace did not generate replacement wall geometry.
          </p>
        </div>
      ) : null}
      <PartialScanScene scan={currentScan} />
      <div className="ss-partial-facts" aria-label="Scan measurements">
        <div>
          <strong>
            {currentScan.mesh
              ? currentScan.mesh.triangleCount.toLocaleString()
              : currentScan.cloud?.count?.toLocaleString() || 0}
          </strong>
          <span>
            {currentScan.mesh
              ? "measured triangles"
              : "captured depth points"}
          </span>
        </div>
        <div>
          <strong>
            {currentScan.mesh?.textureCoverage ??
              currentScan.mesh?.colorCoverage ??
              currentScan.cloud?.colorCoverage ??
              0}%
          </strong>
          <span>
            {currentScan.mesh
              ? "surface color coverage"
              : "point color coverage"}
          </span>
        </div>
      </div>
      {currentScan.fusionReason && (
        <div className="ss-notice ss-notice--status">
          <div className="ss-notice-title">
            <Info size={17} weight="fill" aria-hidden="true" />
            <strong>
              {currentScan.mesh
                ? "Measured surface"
                : "Surface preview fallback"}
            </strong>
          </div>
          <p>
            {currentScan.mesh
              ? currentScan.fusionReason
              : `Surface reconstruction fallback: ${currentScan.fusionReason} The measured RGB-D points are shown instead.`}
          </p>
        </div>
      )}
      <div className="ss-notice ss-notice--success">
        <div className="ss-notice-title">
          <CheckCircle size={17} weight="fill" aria-hidden="true" />
          <strong>Scan saved</strong>
        </div>
        <p>
          This scan can be exported and opened on another device. Continue with
          measurements whenever you want to turn the captured surfaces into a
          room layout.
        </p>
        <p className="ss-notice-detail">
          <strong>Structural detection status:</strong> {currentScan.reason}
        </p>
      </div>
      {exportError && (
        <p role="alert" className="ss-error">
          {exportError}
        </p>
      )}
      <div className="ss-actions">
        <button
          type="button"
          onClick={() => {
            try {
              downloadScan(currentScan);
              setExportError("");
            } catch (reason) {
              setExportError(
                reason.message || "The scan could not be exported.",
              );
            }
          }}
        >
          Export scan
        </button>
        {currentScan.debugCapture && (
          <button
            type="button"
            onClick={() =>
              downloadDepthCapture(
                currentScan.debugCapture,
                currentScan.fusionDiagnostics,
              )
            }
          >
            Download scan diagnostics
          </button>
        )}
        <button className="ss-action-quiet" type="button" onClick={onDone}>
          Back to ScanSpace
        </button>
        <button type="button" onClick={onRescan}>
          Start a new scan
        </button>
        <button
          className="ss-primary"
          type="button"
          onClick={onCompleteManually}
        >
          Continue with measurements
        </button>
      </div>
    </section>
  );
}
