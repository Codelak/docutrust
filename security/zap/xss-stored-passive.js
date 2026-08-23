// Custom OWASP ZAP passive-scan rule for DocuTrust's stored XSS
// (DevSecOps Project 3, DAST).
//
// WHY A CUSTOM RULE: DocuTrust's XSS is STORED — the attacker's payload
// lives in the database (seeded via POST /documents) and is served back
// to every visitor of GET /documents/:id/render. ZAP's active rules
// inject attack strings into request parameters and look for them in the
// response; a stored payload is not a parameter, so the stock rules have
// nothing to inject and nothing to reflect. ZAP does flag the payload's
// presence in the response (the "Modern Web Application" informational
// alert, evidence = the script tag), and this rule makes that detection
// explicit: it raises a proper XSS alert whenever an HTML response
// contains an executable script payload — the standard way stored XSS is
// caught by passive scanning when the scanner didn't plant the payload
// itself.
//
// Pattern set: script tags, event handlers, and javascript: URIs, the
// same family ZAP's own XSS rules use. The DocuTrust seeded payload
// (<script>alert(1)</script> in the document title) matches the script
// tag pattern.

const ScanRuleMetadata = Java.type("org.zaproxy.addon.commonlib.scanrules.ScanRuleMetadata");

function getMetadata() {
	return ScanRuleMetadata.fromYaml(`
id: 90100
name: Stored XSS - Script Payload in HTML Response (DocuTrust)
description: Detects attacker-controlled script payloads (script tags, event handlers, javascript URIs) in HTML responses - the response-side signature of stored XSS.
solution: HTML-escape all dynamic content before interpolation, as the fixed code path already does.
references:
  - https://owasp.org/www-community/attacks/xss/
risk: HIGH
confidence: MEDIUM
cweId: 79
wascId: 8
status: alpha
`);
}

var SCRIPT_PATTERNS = [
	/<script[\s>][\s\S]*?<\/script>/i,
	/<script>alert\(/i,
	/onerror\s*=\s*["']?[^"' >]+/i,
	/onload\s*=\s*["']?[^"' >]+/i,
	/javascript\s*:/i,
];

function scan(ps, msg, src) {
	var res = msg.getResponseBody().toString();
	var header = msg.getResponseHeader().toString().toLowerCase();
	if (header.indexOf("content-type: text/html") === -1) {
		return;
	}
	for (var i = 0; i < SCRIPT_PATTERNS.length; i++) {
		var m = SCRIPT_PATTERNS[i].exec(res);
		if (m !== null) {
			var evidence = m[0];
			if (evidence.length > 60) {
				evidence = evidence.substring(0, 60) + "...";
			}
			ps.newAlert()
				.setEvidence(evidence)
				.raise();
			return; // one finding per response is enough
		}
	}
}
