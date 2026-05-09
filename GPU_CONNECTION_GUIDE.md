# Dreamweave GPU Connection & Deployment Guide

This document explains how to connect to the AMD MI300X Cloud GPU instance via PowerShell (or any other terminal) and outlines the current deployment and working mechanism of the Dreamweave project.

## 🔗 Connection Details

- **Server IP:** `165.245.137.183`
- **Username:** `root`
- **Password:** *None (Just press Enter if prompted)*
- **Docker Container ID:** `e7aa2ed1994d`

### How to Connect via PowerShell

If you switch IDEs or need to access the server from a fresh terminal, simply open PowerShell and run:

```powershell
ssh root@165.245.137.183
```

Once connected to the server, you need to enter the Docker container where the Dreamweave application and the GPU drivers are running:

```bash
docker exec -it e7aa2ed1994d bash
```

Inside the container, navigate to the project directory:

```bash
cd /app/dreamweave
```

---

## 🚀 Deployment Mechanism (The Workflow)

Dreamweave is currently configured to run using a Git-based pull-and-restart workflow. 

### Step-by-Step Deployment:
1. **Make Changes Locally:** Edit the code on your Windows machine in your IDE.
2. **Push to GitHub:** Commit and push your changes to the `main` branch.
   ```powershell
   git add .
   git commit -m "Your commit message"
   git push origin main
   ```
3. **Deploy to GPU:** Pull the new code on the GPU server and restart the FastAPI backend so it serves the latest code.
   You can do this directly from your local PowerShell in a single command without even logging in manually:
   
   ```powershell
   ssh -o StrictHostKeyChecking=no root@165.245.137.183 "docker exec e7aa2ed1994d bash -c 'cd /app/dreamweave && git pull origin main && bash /tmp/restart_api.sh'"
   ```

*Note: `/tmp/restart_api.sh` is a helper script we created inside the container that safely kills the old FastAPI process and spins up a new one in the background.*

---

## ⚙️ How the System Currently Works

The project is now fully productionized on the AMD GPU. It consists of three main components running inside the `e7aa2ed1994d` container:

1. **vLLM Inference Server (Port 30000):** 
   Hosts the `Qwen/Qwen2.5-7B-Instruct` model in memory utilizing the GPU's massive 192GB VRAM.
2. **FastAPI Backend (Port 8000):**
   Acts as the orchestrator. It manages the Layered Memory Intelligence (L1/L2/L3 alignments), handles embedding generation (`all-mpnet-base-v2`), computes graph connections, and streams requests to the vLLM server.
3. **Frontend (`dreamweave.html`):**
   Served seamlessly by the FastAPI backend. It contains no mock data. Instead, it maintains a live Server-Sent Events (SSE) connection to the backend (`/retrieve/stream`). It dynamically updates the Memory Graph Visualization and generates the alignment cards progressively as it receives real data from the backend.

### Important URLs
- **Live App:** `http://165.245.137.183:8000/`
- **Backend Health Check:** `http://165.245.137.183:8000/health`
- **LLM Health Check:** `http://165.245.137.183:8000/health/llm`
