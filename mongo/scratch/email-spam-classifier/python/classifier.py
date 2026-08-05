import os
import urllib.request
import zipfile
import io
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.metrics import classification_report, accuracy_score

# 1. LOAD DATASET (With fallback to local mockup data if offline)
def load_data():
    url = "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"
    print("Attempting to download SMS Spam Collection dataset from UCI Repository...")
    try:
        # Request with a User-Agent to avoid HTTP 403 Forbidden errors
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            zip_data = response.read()
            
        with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
            # The zip file contains 'SMSSpamCollection' file
            with z.open('SMSSpamCollection') as f:
                df = pd.read_csv(f, sep='\t', names=['label', 'message'])
        print(f"Successfully downloaded and loaded {len(df)} samples.")
        return df
    except Exception as e:
        print(f"\n[Warning] Could not download dataset: {e}")
        print("Falling back to a local curated dataset for demonstration purposes...\n")
        
        # Hardcoded fallback dataset (mix of Spam and Ham)
        fallback_data = [
            ("spam", "Congratulations! You have won a free $1000 gift card. Claim your prize now!"),
            ("spam", "Urgent: Your account is suspended. Click here to verify your identity and update bank details."),
            ("spam", "Get cheap replica watches and luxury designer bags. Buy now for 90% discount!"),
            ("spam", "Make money fast from home. Earn up to $500 per day with this simple system."),
            ("spam", "Double your bitcoin investment in 24 hours. Guaranteed returns. Sign up now."),
            ("spam", "Final notice: You owe outstanding tax. Pay immediately to avoid legal arrest."),
            ("spam", "Hello, I am a prince and I need your help to transfer $10 million. You get 30% commission."),
            ("spam", "Buy weight loss pills now. Best deals on cheap pharmacy products online."),
            ("spam", "Act now to claim your free lottery reward. Offer expires in 2 hours. Click link."),
            ("spam", "Free trial for adult webcam chat. Direct access, no credit card required."),
            ("ham", "Hi John, are we still meeting for lunch today at 12:30 at the corner cafe?"),
            ("ham", "Here is the project report you requested. Please let me know if you have any feedback."),
            ("ham", "Thanks for the email. I will review the document and get back to you by tomorrow morning."),
            ("ham", "Hey, can you send me the link to the shared folder? I can't find it in my inbox."),
            ("ham", "Meeting rescheduled to 3 PM. Hope that works for everyone in the department."),
            ("ham", "The team dinner is confirmed for Friday night. Please RSVP by Wednesday noon."),
            ("ham", "Dear student, your assignment submission has been received successfully in the portal."),
            ("ham", "Let's catch up this weekend. Let me know what time works best for you."),
            ("ham", "Please find attached the invoice for last month's consulting services."),
            ("ham", "I will be out of the office starting tomorrow, returning next Tuesday. For urgent issues, contact Sarah."),
            ("ham", "Got the tickets. See you at the theater at 7 PM!"),
            ("ham", "Can you please check the server logs? We are seeing some latency issues."),
            ("ham", "Just wanted to check in. Let me know when you are free for a call."),
            ("ham", "Let's meet tomorrow to discuss the design guidelines and finalize the UI components.")
        ]
        # Multiply size slightly to allow training splits
        extended_data = fallback_data * 5
        df = pd.DataFrame(extended_data, columns=['label', 'message'])
        print(f"Loaded local fallback dataset with {len(df)} samples.")
        return df

def main():
    print("=" * 60)
    print("         EMAIL SPAM RECOGNITION AI - PYTHON STUDIO")
    print("=" * 60)
    
    # Load data
    df = load_data()
    
    # 2. DATA PREPROCESSING & SPLITTING
    # Split dataset into training set (80%) and testing set (20%)
    X_train, X_test, y_train, y_test = train_test_split(
        df['message'], 
        df['label'], 
        test_size=0.2, 
        random_state=42, 
        stratify=df['label']
    )
    
    # 3. FEATURE EXTRACTION (TF-IDF Vectorizer)
    # Convert text messages into numerical feature vectors
    # ngram_range=(1,2) extracts both single words and two-word phrases (e.g. "free gift")
    vectorizer = TfidfVectorizer(stop_words='english', lowercase=True, ngram_range=(1, 2))
    
    X_train_tfidf = vectorizer.fit_transform(X_train)
    X_test_tfidf = vectorizer.transform(X_test)
    
    # 4. TRAINING THE CLASSIFIER (Multinomial Naive Bayes)
    classifier = MultinomialNB(alpha=1.0)
    classifier.fit(X_train_tfidf, y_train)
    
    # 5. EVALUATION
    y_pred = classifier.predict(X_test_tfidf)
    accuracy = accuracy_score(y_test, y_pred)
    
    print("\n--- Model Evaluation ---")
    print(f"Overall Accuracy: {accuracy * 100:.2f}%")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    # 6. INTERACTIVE PLAYGROUND
    print("\n" + "=" * 60)
    print("               INTERACTIVE TESTING PLAYGROUND")
    print("=" * 60)
    print("Enter custom messages below to check if the model classifies them as Spam or Ham.")
    print("Type 'exit' or press Ctrl+C to quit.\n")
    
    while True:
        try:
            user_input = input("Enter email text: ").strip()
            if not user_input:
                continue
            if user_input.lower() == 'exit':
                break
                
            # Process & Predict
            transformed_input = vectorizer.transform([user_input])
            prediction = classifier.predict(transformed_input)[0]
            probabilities = classifier.predict_proba(transformed_input)[0]
            
            # Print Result
            spam_idx = list(classifier.classes_).index('spam')
            spam_prob = probabilities[spam_idx] * 100
            ham_prob = (1 - probabilities[spam_idx]) * 100
            
            label_display = "\033[91mSPAM\033[0m" if prediction == "spam" else "\033[92mHAM (Legitimate)\033[0m"
            print(f"Result: {label_display}")
            print(f"Confidence: Spam: {spam_prob:.1f}% | Ham: {ham_prob:.1f}%")
            print("-" * 50)
            
        except (KeyboardInterrupt, EOFError):
            print("\nExiting. Goodbye!")
            break

if __name__ == "__main__":
    main()
