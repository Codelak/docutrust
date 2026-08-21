# S5 — Dependency confusion defense: configured and proven

Screenshot: `docs/project-2/images/11-scope-demo.png` (with-defense
capture); the control is in `control-without-defense.txt`.

## The attack this prevents

**Dependency confusion:** an attacker publishes a package on the
public registry whose name matches one an internal app is *supposed*
to resolve internally — e.g. `@docutrust/shared` or `docutrust-utils`.
npm cannot tell "internal-looking" from "public"; it resolves any
name it is given against whatever registry the config says. Without
defense, a developer adding `@docutrust/shared` to package.json gets
the *attacker's* code installed and, with it, code execution at
install time or load time.

## The defense (`.npmrc`)

```ini
@docutrust:registry=https://npm.docutrust.internal/
registry=https://registry.npmjs.org/
```

- The `@docutrust` scope is pinned to the private registry.
- npm therefore **never queries the public registry for that scope** —
  resolution is fail-closed: private registry unreachable ⇒ loud
  error, not a silent fallback to npmjs.org.
- Everything else still resolves normally (control below).
- In a real org, `npm.docutrust.internal` is replaced by the org's
  real private registry (GitHub Packages, Verdaccio, Artifactory…),
  usually requiring auth — which adds a second layer: even a mistake
  in the config cannot fetch a public squat because the token scope
  is registry-specific.

## The demonstration (both directions, real output)

**With the defense** — `npm view @docutrust/shared`:

```
ENOTFOUND ... network request to https://npm.docutrust.internal/@docutrust%2fshared
```

npm never contacted the public registry. It failed against the
private host. That is the defense working: a shadow package cannot
even be *looked up*, let alone installed.

**Control, no defense** — same command with the scope pointed at
npmjs.org (which is npm's behavior with no `.npmrc`):

```
404 Not Found - GET https://registry.npmjs.org/@docutrust%2fshared
```

npm asked the public registry. The 404 today is luck — a squat with
that name would have returned 200 and been installed.

**Control, normal resolution unaffected** — `npm view lodash version`
→ `4.18.1`. Non-scoped packages resolve exactly as before.

## How a reviewer verifies this independently

```sh
npm config get @docutrust:registry        # must print the private URL
npm view @docutrust/shared                # must fail, never E404-from-npmjs
```
