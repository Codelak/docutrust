// Custom OWASP ZAP active-scan rule for DocuTrust's /documents/search
// endpoint (DevSecOps Project 3, DAST).
//
// WHY A CUSTOM RULE: ZAP's built-in SQL Injection rule sends database-
// specific probes, some of which contain double quotes. DocuTrust's
// intentionally naive search parser (src/lib/searchQuery.js) enters an
// infinite loop on an unclosed double quote and grows memory until the
// process dies — a real DoS bug that is Project 7's (Continuous Fuzzing)
// designated fuzz target and must NOT be fixed here. Probing it with a
// double-quote payload would crash the scan target mid-scan (observed for
// real on the first scan: the app OOM-crashed and the run aborted with
// only passive findings). Restricting the probe set to single-quote-only
// variants is standard scanner tuning and keeps the target alive.
//
// The payloads below pass through parseSearchQuery() intact (single
// quotes are not special to it) and reach the vulnerable concatenated
// ILIKE query in src/routes/documents.js (VULN_MODE test build). The
// detection is differential: a boolean-based injection makes the result
// set far wider than the baseline response (the OR TRUE payload dumps
// the whole documents table), so the response body grows well beyond the
// baseline. Same technique ZAP's own SQLi rule uses, minus the payloads
// that kill the target.

const ScanRuleMetadata = Java.type("org.zaproxy.addon.commonlib.scanrules.ScanRuleMetadata");

function getMetadata() {
	return ScanRuleMetadata.fromYaml(`
id: 90099
name: SQL Injection - Single-Quote Probes (DocuTrust)
description: SQL injection probing of the q parameter with a curated, single-quote-only payload set (differential response detection). Double-quote payloads are excluded because the target's naive query parser hangs on an unclosed double quote (Project 7's fuzz target).
solution: Use parameterized queries (bound parameters), as the fixed code path already does.
references:
  - https://owasp.org/www-community/attacks/SQL_Injection
category: INJECTION
risk: HIGH
confidence: MEDIUM
cweId: 89
wascId: 19
status: alpha
`);
}

var PAYLOADS = [
	"'",
	"' OR 1=1 --",
	"' OR '1'='1",
	"' OR '1'='1' --",
	"1' OR '1'='1",
	"' UNION SELECT NULL, NULL --",
];

function scan(as, msg, param, value) {
	// Only the search endpoint's q parameter is in scope for this rule.
	var path = msg.getRequestHeader().getURI().getPath();
	if (param !== "q" || !path.endsWith("/documents/search")) {
		return;
	}

	// Baseline: the original request as scanned.
	var baseline = msg.cloneRequest();
	as.sendAndReceive(baseline, false, false);
	var baseBody = baseline.getResponseBody().toString();

	for (var i = 0; i < PAYLOADS.length; i++) {
		if (as.isStop()) {
			return;
		}
		var payload = PAYLOADS[i];
		var test = msg.cloneRequest();
		as.setParam(test, param, payload);
		as.sendAndReceive(test, false, false);
		var body = test.getResponseBody().toString();

		// Differential check: the OR TRUE payloads dump the whole table
		// (10+ rows) versus the baseline's single matching row, so the
		// response is substantially longer. A generous margin keeps
		// benign fluctuations out.
		if (body.length > baseBody.length + 50) {
			as.newAlert("90099-1")
				.setParam(param)
				.setAttack(payload)
				.setEvidence(payload)
				.setMessage(test)
				.raise();
			return; // one confirmed finding is enough
		}
	}
}
