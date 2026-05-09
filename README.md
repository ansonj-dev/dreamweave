# Dreamweave

Dreamweave is a Continuous, Structural Memory Engine designed for the next generation of autonomous AI agents. Unlike standard Retrieval-Augmented Generation (RAG) which relies on isolated document chunks, Dreamweave wires information together exactly like the human brain.

## Architecture

Dreamweave utilizes a proprietary three-layer memory structure:
1. **L1: Surface Memory** - Stores raw facts, direct quotes, and exact data points.
2. **L2: Associative Graph** - A dynamic spiderweb that maps how those facts connect to each other across different documents, understanding the topology of information.
3. **L3: Structural Schemas** - Captures the deep, underlying patterns of behavior and logic, enabling the AI to reason structurally.

## The Kick Mechanism

To combat LLM hallucinations caused by context drift, Dreamweave employs a "Kick" mechanism (inspired by *Inception*). By mathematically evaluating the deviation of the retrieval vectors, the Kick mechanism detects structural hallucinations in real-time, halting the context drift and forcefully re-grounding the AI's generation.

## Features
- **Real-Time Knowledge Ingestion**: Seamlessly ingest PDFs, TXT, and media transcripts.
- **Dynamic 3D Memory Graph**: Visualize the AI's internal thought process and associative pathways in real-time.
- **Live Vector Tracking**: Real-time Kick-metric telemetry and anomaly detection.

## License

Proprietary and Confidential.
