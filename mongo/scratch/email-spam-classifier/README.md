# SpamShield Studio AI 🛡️

An educational and interactive Email Spam Recognition AI studio. This project contains two implementations of a spam classifier using the **Multinomial Naive Bayes** algorithm:

1. **Interactive Web App (`/app`)**: A client-side, zero-install, beautiful web playground. You can write emails, see real-time classification, watch word triggers highlight, and even train the model on the fly by adding custom sentences.
2. **Python Classifier (`/python`)**: A production-style Python implementation using `scikit-learn` (`TfidfVectorizer` + `MultinomialNB`) that automatically downloads the UCI SMS Spam Collection dataset, trains the model, outputs performance metrics, and lets you test it in your terminal.

---

## Project Structure

```text
email-spam-classifier/
├── README.md                  # Project overview and instructions
├── app/
│   └── index.html             # Beautiful interactive web app
└── python/
    ├── classifier.py          # Python model training & CLI evaluation script
    └── requirements.txt       # Python dependencies
```

---

## 🌐 Quick Start: Interactive Web App

No installation required! Just open the HTML file directly in any modern browser:

1. Double-click or open [index.html](file:///C:/Users/user/.gemini/antigravity/scratch/email-spam-classifier/app/index.html) in your web browser.
2. Type or paste your email text in the **Classifier Sandbox** on the left.
3. Click **Classify Text** to see:
   - **Spam Probability Gauge** (dynamic colors).
   - **Spam/Ham badge classification**.
   - **Trigger Word highlights** explaining *why* it was classified as spam or ham.
4. Use the **Dynamic Model Trainer** on the right to enter your own text, label it as Spam or Ham, and retrain the model in real time.

---

## 🐍 Setup & Run: Python Classifier

To run the Python classifier, make sure you have Python 3 installed.

### 1. Set up a virtual environment (Recommended)
Open your terminal inside the project directory and run:

```bash
# Navigate to the python directory
cd python

# Create a virtual environment
python -m venv venv

# Activate it (Windows)
.\venv\Scripts\activate

# Activate it (Mac/Linux)
source venv/bin/activate
```

### 2. Install dependencies
Install the required packages (`pandas` and `scikit-learn`):

```bash
pip install -r requirements.txt
```

### 3. Run the classifier
Start the interactive training and classification script:

```bash
python classifier.py
```

- The script will attempt to download the **UCI SMS Spam Collection** dataset (5,574 messages).
- If offline, it automatically falls back to an internal mock dataset to ensure it runs correctly.
- It will evaluate the model and output its **Accuracy**, **Precision**, **Recall**, and **F1-Score**.
- You can then type custom emails in your terminal to see real-time classification predictions and confidence levels!
