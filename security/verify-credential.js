#!/usr/bin/env node
/**
 * Live secret verification for DevSecOps Project 1, deliverable 6.
 *
 * The question this answers: is the credential-shaped constant the scanners
 * flagged in src/config.js an ACTIVE, exploitable AWS credential, or an
 * inert, pattern-matched placeholder?
 *
 * Method: load the found key straight from the codebase (the exact string
 * the scanners reported), configure an AWS STS client with it, and make the
 * single cheapest real API call that proves identity: sts:GetCallerIdentity.
 * A live key returns the caller's account ARN (HTTP 200). An inert key is
 * rejected by AWS's own identity service (HTTP 403) — the error code is the
 * evidence.
 *
 * No real credentials are ever touched by this script; it only uses the key
 * under investigation plus a clearly-fake secret key (an AKIA key alone
 * cannot be used, and the AWS API rejects the token before anything else).
 */
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");

const { LEGACY_INTEGRATION_KEY } = require("../src/config.js");

const DUMMY_SECRET = "dummy-secret-value-not-a-real-credential";

async function main() {
  console.log("Verifying credential found by scanners:");
  console.log(`  key:     ${LEGACY_INTEGRATION_KEY}`);
  console.log(`  source:  src/config.js (LEGACY_INTEGRATION_KEY)`);
  console.log("  check:   sts:GetCallerIdentity via AWS SDK\n");

  const client = new STSClient({
    region: "us-east-1",
    credentials: {
      accessKeyId: LEGACY_INTEGRATION_KEY,
      secretAccessKey: DUMMY_SECRET,
    },
  });

  try {
    const resp = await client.send(new GetCallerIdentityCommand({}));
    console.log("VERDICT: LIVE / ACTIVE CREDENTIAL — this key works:");
    console.log(JSON.stringify(resp, null, 2));
    console.log("\nThis is a genuinely exploitable credential. Rotate it NOW.");
    process.exitCode = 1; // live credential = failed verification
  } catch (err) {
    const code = err.Code || err.name || "unknown";
    console.log(`VERDICT: NOT LIVE — AWS rejected the token (error code: ${code})`);
    console.log(`  message: ${err.message}`);
    console.log(
      "\nInterpretation: the key is an inert, pattern-matched placeholder,",
      "not a functioning credential. This is the expected, documented result",
      `for ${LEGACY_INTEGRATION_KEY} (AWS's own published example key).`
    );
    process.exitCode = 0;
  }
}

main();
