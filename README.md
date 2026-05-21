# Growth OS

Growth OS is an interactive execution framework and experiment tracking application designed to replace fragmented marketing spreadsheets with a rigorous, system-driven operating engine. 

It enables growth leaders, product managers, and marketing architects to prioritize high-leverage initiatives, maintain absolute data hygiene, and continuously calibrate performance estimates against actual revenue outcomes.

### 🔗 Live Environments
* **🚀 Launch Live Application:** [https://cristobaldupuis.github.io/growth-os/](https://cristobaldupuis.github.io/growth-os/)
* **⚡ Open Interactive Code Sandbox:** [https://stackblitz.com/github/cristobaldupuis/growth-os](https://stackblitz.com/github/cristobaldupuis/growth-os)

---

## 🏛️ Core Architectural Features

### 1. Macro-Level Performance Dashboard
* **Capital Risk Metrics:** Tracks total revenue impacted by completed tests alongside active revenue currently at risk across running initiatives.
* **Estimate Calibration Engine:** Automatically computes a running accuracy percentage by comparing initial revenue estimates against realized values, preventing structural overestimation and forcing realistic baseline modeling.
* **Velocity Metrics:** Visualizes workflow velocity via micro-sparkline charts tracking weekly iteration rates (started vs. closed tasks) over a rolling 8-week horizon.
* **Distribution Mapping:** Real-time categorical, thematic, and outcome breakdowns mapping structural allocation across Paid Media, Conversion, Retention, and Merchandising.

### 2. High-Fidelity Experiment Lifecycle Tracking
* **Structured Hypotheses:** Enforces a rigid syntax framework separating variables: *We believe [Change] will result in [Outcome] for [Audience], because [Reasoning].*
* **Rigid Control Parameters:** Dedicated fields protecting operational discipline, including defined primary metrics, explicit sample size demands, duration scope, and hard kill criteria.
* **Sequential Dependency Mapping:** Allows distinct initiatives to be structurally linked to map downstream impacts, subsequent clean moves, or multi-cell operational sequencing.

### 3. Integrated AI Optimization Toolkit
* **Intelligent Hypothesis Expansion:** Connects to language model primitives to transform rough conceptual notes into mathematically precise, single-sentence growth hypotheses based on your specific business model.
* **Predictive ICE Scoring Assist:** Leverages contextual data variables to evaluate and pitch unbiased Impact and Certainty values (1–10) complete with structural rationales to strip gut-feeling bias from prioritization matrices.

---

## 🛠️ Technology Stack & System Design

* **Runtime & Interface:** React 18 / Vite (Scaffolded for zero-latency, modular layout rendering)
* **Design Language:** Custom high-contrast, minimalist serif interface optimizing structural scannability.
* **Iconography:** Built-in Tabler Webfont implementation.
* **State Persistence:** Engineered with a robust, environment-agnostic data storage layer natively targeting `window.storage` (Claude Artifact sandboxes), browser `localStorage` (StackBlitz/Production), or localized memory fallbacks to preserve application state dynamically.

---

## 🚀 Local Development Setup

To run this project locally on your machine, ensure you have Node.js installed, then execute the following commands in your terminal:

```bash
# 1. Clone the repository
git clone [https://github.com/cristobaldupuis/growth-os.git](https://github.com/cristobaldupuis/growth-os.git)

# 2. Navigate into the directory
cd growth-os

# 3. Install dependencies
npm install

# 4. Spin up the local development server
npm run dev


Once the terminal flags the build as ready, open http://localhost:5173/ in your browser to view your local instance.
Uhmmm
👨‍💻 Author & Architecture
Designed and engineered by Cristobal Dupuis.

Portfolio & Systems Architecture: cristobaldupuis.com