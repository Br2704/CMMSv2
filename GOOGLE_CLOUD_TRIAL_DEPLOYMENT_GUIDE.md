# Google Cloud Trial Deployment Guide for CMMSv2

This guide deploys the CMMSv2 Docker stack to a Google Cloud Compute Engine VM using the Google Cloud free trial credit.

The goal is to keep the deployment simple:

- one VM
- one Docker Compose stack
- PostgreSQL in Docker
- backend in Docker
- frontend in Docker
- direct browser access through the VM external IP

## Recommended deployment model

Use **Google Compute Engine** with **Ubuntu 22.04 LTS** and run the existing production Docker Compose stack.

Why this approach:

- it is the easiest path for a trial account
- it does not require rewriting the app for serverless hosting
- it keeps the database and services together
- it matches the current Docker-based project structure

## What will be exposed

By default, the production compose file exposes:

- Frontend: `8080`
- Backend: `3001`
- PostgreSQL: `5432`

For a trial deployment, the recommended public access is:

- public: frontend on `8080`
- optional: backend on `3001` if you need direct API access
- private: PostgreSQL should remain internal whenever possible

## Prerequisites

Before you start, make sure you have:

- a Google account with free trial credits enabled
- a Google Cloud project created
- billing enabled for the trial project
- basic access to your terminal or PowerShell
- the CMMSv2 source code ready in git

## 1. Create the Google Cloud project

1. Go to the Google Cloud Console.
2. Create a new project for CMMSv2.
3. Attach the free trial billing account.
4. Enable the **Compute Engine API**.

If you want to use the gcloud CLI locally, install it from Google and sign in:

```bash
gcloud init
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

## 2. Create the VM

Recommended VM settings for trial deployment:

- Machine type: `e2-small` or `e2-medium`
- OS: `Ubuntu 22.04 LTS`
- Boot disk: `30 GB` or more
- Region: pick one close to your users
- External IP: assign a static IP if you want a stable URL

Suggested firewall rules:

- allow TCP `8080`
- allow TCP `3001` only if you want direct API access
- do not expose `5432` to the internet unless you have a strong reason

If you create the VM from the console, also enable HTTP and HTTPS if you plan to add a reverse proxy later.

## 3. SSH into the VM

From the Google Cloud Console, open an SSH session to the VM.

Or from your local machine with gcloud:

```bash
gcloud compute ssh YOUR_VM_NAME --zone YOUR_ZONE
```

## 4. Install Docker on the VM

Run these commands on the VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

## 5. Clone the CMMSv2 repository

On the VM:

```bash
cd /opt
sudo git clone YOUR_REPO_URL cmmsv2
sudo chown -R $USER:$USER /opt/cmmsv2
cd /opt/cmmsv2
```

If your repository is private, use one of these approaches:

- deploy key
- personal access token
- zip upload
- GitHub CLI login

## 6. Create the production environment file

Create a root `.env` file in the repository on the VM.

Use the public IP of the VM once it is assigned.

Example:

```bash
APP_BASE_URL=http://YOUR_VM_EXTERNAL_IP:8080
APP_CORS_ORIGINS=http://YOUR_VM_EXTERNAL_IP:8080,http://localhost:8080,http://127.0.0.1:8080
DB_USER=postgres
DB_PASSWORD=change-this-password
JWT_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-long-random-refresh-secret
DATA_ENCRYPTION_KEY=replace-with-a-long-random-encryption-key
```

Generate secure secrets with:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Important:

- keep `APP_BASE_URL` pointed at the VM public URL
- keep the secrets long and random
- do not reuse development secrets in production

## 7. Start the stack

From the repository root on the VM:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This will:

- build the backend image
- build the frontend image
- start PostgreSQL
- run backend migrations
- start the production frontend

## 8. Verify the deployment

Check running services:

```bash
docker compose -f docker-compose.prod.yml ps
```

Check logs:

```bash
docker compose -f docker-compose.prod.yml logs backend --tail 100

docker compose -f docker-compose.prod.yml logs frontend --tail 100

docker compose -f docker-compose.prod.yml logs postgres --tail 50
```

Health check the backend:

```bash
curl http://localhost:3001/health
```

If the VM firewall is open, test from your browser:

- `http://YOUR_VM_EXTERNAL_IP:8080`

## 9. If you want a cleaner public URL

You can add a reverse proxy later so users can open the app on port `80` instead of `8080`.

Simple options:

- Nginx on the VM
- Google Cloud HTTP(S) Load Balancer
- a custom domain with HTTPS

For the easiest trial deployment, you can stay on `8080` first and move to a domain later.

## 10. Updating the app after changes

When you push new code to git or upload new code to the VM:

```bash
cd /opt/cmmsv2
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

If you want a full reset of the stack:

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

## 11. Useful admin commands

View status:

```bash
docker compose -f docker-compose.prod.yml ps
```

Follow logs:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Restart only the backend:

```bash
docker compose -f docker-compose.prod.yml restart backend
```

Restart only the frontend:

```bash
docker compose -f docker-compose.prod.yml restart frontend
```

Stop everything:

```bash
docker compose -f docker-compose.prod.yml down
```

## 12. Backup strategy

Your production compose file already mounts a backups folder on the host.

Recommended approach:

- keep periodic database backups from the VM
- copy backups to Cloud Storage if you need retention
- verify restore before depending on the backup process

A simple manual backup pattern:

```bash
docker exec -t $(docker compose -f docker-compose.prod.yml ps -q postgres) pg_dump -U postgres postgres > backups/cmmsv2_$(date +%F).sql
```

If your container name differs, use `docker compose ps -q postgres` to get it.

## 13. Cost control for the free trial

To stay inside trial budget:

- use one small VM for testing
- stop the VM when not in use
- avoid oversized disks
- avoid adding load balancers until needed
- do not expose extra services publicly

When you are done testing:

```bash
gcloud compute instances stop YOUR_VM_NAME --zone YOUR_ZONE
```

## 14. Troubleshooting

### Site does not open

- confirm the VM is running
- confirm firewall allows port `8080`
- confirm the frontend container is up
- confirm you are using the external IP

### Backend health check fails

- inspect backend logs
- verify `.env` values are correct
- confirm database container is healthy
- confirm the backend can reach PostgreSQL

### Database connection issues

- check `DB_HOST=postgres`
- check the postgres container status
- check the password matches the compose environment

### App loads but API calls fail

- verify `APP_BASE_URL`
- verify `APP_CORS_ORIGINS`
- confirm the frontend build is using `/api` as the API base path

### Docker command not found

- reinstall Docker on the VM
- log out and back in after adding your user to the `docker` group

## 15. Recommended production settings

If you want a safer public deployment:

- add HTTPS
- put a reverse proxy in front of the frontend
- keep PostgreSQL private
- use a static external IP
- rotate secrets before go-live
- restrict SSH access by IP where possible

## 16. One-page quick deploy checklist

1. Create Google Cloud project with billing.
2. Enable Compute Engine.
3. Create Ubuntu VM.
4. Open port `8080` in firewall.
5. SSH into the VM.
6. Install Docker and Docker Compose plugin.
7. Clone the CMMSv2 repo.
8. Create `.env` with your public IP and secrets.
9. Run `docker compose -f docker-compose.prod.yml up -d --build`.
10. Open `http://YOUR_VM_EXTERNAL_IP:8080`.

## 17. Notes specific to this app

- The frontend is built as a Docker image and served by Nginx.
- The backend runs migrations automatically before starting.
- PostgreSQL is managed by Docker Compose.
- The app already supports the production compose flow in this repository.
- The bulk upload UI changes you made are included automatically when you rebuild the frontend image.

## 18. Best deployment path for your current repository

For this repository, the best Google Cloud trial path is:

- Compute Engine VM
- Docker Compose production stack
- one public frontend endpoint on port `8080`
- backend and database inside the same VM

That is the simplest way to get the app running quickly on the trial account.

## 19. Optional next step

If you want, the next improvement is to add a small deploy script that runs these commands for you on the VM so future updates are one command.

Example command sequence:

```bash
cd /opt/cmmsv2
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

End of guide.
