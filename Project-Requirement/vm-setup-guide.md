# AWS VM Setup Guide — DocuTrust DevSecOps track

Steps to get your VM to the same state as the WSL machine: app running
on port 3000, Postgres on localhost, and the Project 1 scanning tools
(Semgrep + Gitleaks) installed and verified.

## 1. Launch the VM (AWS console)

1. **AMI:** Ubuntu 24.04 LTS
2. **Instance type:** `t3.small` (2 GB RAM is enough)
3. **Key pair:** create a new one, download the `.pem` file
4. **Security group:** inbound rules for `22` (SSH) and `3000` (app) from your IP only
5. Launch, then connect:
   ```bash
   ssh -i /path/to/your-key.pem ubuntu@<PUBLIC-IP>
   ```
   (If permissions complain: `chmod 400 /path/to/your-key.pem`)

## 2. Base packages + Node

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl pipx
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v20.x
npm --version
```

## 3. Clone the repo

```bash
git clone https://github.com/Codelak/docutrust.git
cd docutrust
```
The repo is private, so GitHub will ask for authentication:
`gh auth login` (recommended) or a personal access token (PAT) with
`repo` scope as the password.

**Verify you have all Project 1 work:**
```bash
git log --oneline -3        # should end at 5ecb045
ls evidence/ docs/ semgrep/ # deliverables present
```

## 4. Postgres

```bash
sudo apt install -y postgresql
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE USER docutrust WITH PASSWORD 'docutrust_dev_password';"
sudo -u postgres psql -c "CREATE DATABASE docutrust OWNER docutrust;"
```

## 5. App setup

**Important:** the app does NOT auto-load `.env.local` (no dotenv) —
`src/db.js` reads `process.env.DATABASE_URL` directly. You must load it
in your shell before `migrate` and `start`:

```bash
cp .env.example .env.local   # DATABASE_URL already points at localhost:5432
npm install
set -a && . ./.env.local && set +a    # load DATABASE_URL into the shell
npm run migrate              # creates the schema
```

## 6. Start the app

```bash
set -a && . ./.env.local && set +a && npm start   # listens on port 3000
```
In a second terminal:
```bash
curl localhost:3000/healthz  # expect {"status":"ok","version":"dev"}
curl -X POST localhost:3000/documents -H 'Content-Type: application/json' \
  -d '{"title":"vm test","body":"hello from aws"}'
```
Then browse `http://<PUBLIC-IP>:3000/healthz` from your laptop.

---

## 7. Install Semgrep (SAST)

```bash
pipx install semgrep
pipx ensurepath
# open a new terminal, then:
semgrep --version
```

Verify it catches the project's custom rule (this is your Project 1
rule; it should report **no findings** now that the SQLi is fixed):

```bash
semgrep --metrics=off --config semgrep/rules/ --error src/
# exit code 0, 0 findings — the fix is holding
```

## 8. Install Gitleaks (secrets scanning)

Use the same version as your CI workflow (v8.30.1) so VM results match
the pipeline:

```bash
curl -sL https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz -o gitleaks.tar.gz
tar -xzf gitleaks.tar.gz gitleaks
sudo mv gitleaks /usr/local/bin/
gitleaks version   # 8.30.1
```

Verify against the repo — **important:** always pass `-c gitleaks.toml`
(project config), because the default entropy rules miss the seeded
placeholder key in `src/config.js`:

```bash
gitleaks detect --source . -c gitleaks.toml --no-banner
# expected: 1 finding — AKIAIOSFODNN7EXAMPLE in src/config.js (allowlisted references only)
```

## 9. Sanity check your install matches Project 1 evidence

| Tool | Command | Expected |
|---|---|---|
| semgrep | `semgrep --version` | ≥ 1.173 |
| semgrep + custom rule | `semgrep --metrics=off --config semgrep/rules/ src/` | 0 findings |
| gitleaks | `gitleaks version` | 8.30.1 |
| gitleaks project config | `gitleaks detect --source . -c gitleaks.toml --no-banner` | 1 finding (seeded key) |

## Notes

- `semgrep/rules/`, `gitleaks.toml`, and `.github/workflows/ci.yml`
  all came with the clone — no need to recreate them.
- Never push the `.env.local` file; it's in `.gitignore`.
- Tools for later projects (Jazzer.js for fuzzing, Cosign, Kyverno, …)
  get installed by each project's own instructions.
