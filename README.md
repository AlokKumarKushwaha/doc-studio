# 📄 DocStudio - All-in-One PDF & PPT Editor and Converter

एक आधुनिक, तेज़ और यूज़र-फ्रेंडली **Web Application** जो PDF और PPT को एडिट करने, एक-दूसरे में कन्वर्ट करने (PDF to PPT, PPT to PDF) और मैनेज करने की पूरी सुविधा देता है।

---

## 🌟 मुख्य फीचर्स (Features)

1. **🔄 Bidirectional Converters:**
   - **PDF to PPT:** PDF के पेजों के टेक्स्ट, हेडिंग्स और इमेजेस को एडिटेबल PowerPoint (`.pptx`) स्लाइड्स में बदलना।
   - **PPT to PDF:** PowerPoint प्रेजेंटेशन को हाई-क्वालिटी universal PDF में एक्सपोर्ट करना।
2. **📑 PDF Editor & Annotation:**
   - PDF अपलोड और लाइव पेज व्यूअर।
   - पेन, हाइलाइटर, टेक्स्ट नोट्स और डिजिटल सिग्नेचर ड्रॉ करना।
   - एडिटेड PDF तुरंत डाउनलोड करना।
3. **📊 PPT Slide Studio:**
   - ब्राउज़र में ही प्रेजेंटेशन स्लाइड्स डिज़ाइन करना (कलर थीम्स, टाइटल्स, बुलेट पॉइंट्स)।
   - असली माइक्रोसॉफ्ट पावरपॉइंट (`.pptx`) फाइल 1-क्लिक में डाउनलोड करना।
4. **🛠️ PDF Utilities:**
   - Merge PDFs (कई फाइलों को जोड़ना)
   - Split PDF (पेज रेंज अलग करना)
   - Images to PDF (JPG/PNG को PDF में बदलना)
   - Watermark PDF (वाटरमार्क स्टैम्प लगाना)

---

## 🚀 1. VS Code में कैसे चलाएं (Local Setup)

### स्टेप 1: फोल्डर को VS Code में खोलें
1. VS Code खोलें।
2. `File` > `Open Folder...` पर क्लिक करें और इस फोल्डर को सेलेक्ट करें:
   `C:\Users\v9919\.gemini\antigravity\scratch\doc-studio`

### स्टेप 2: टर्मिनल खोलें और वर्चुअल एनवायरनमेंट बनाएं
VS Code में टर्मिनल खोलें (`Ctrl + ~`) और ये कमांड्स चलाएं:

```bash
# वर्चुअल एनवायरनमेंट बनाएं (Optional लेकिन रेकमेंडेड)
python -m venv .venv

# एक्टिवेट करें (Windows PowerShell में):
.venv\Scripts\Activate.ps1

# सभी जरूरी लाइब्रेरीज़ इनस्टॉल करें:
pip install -r requirements.txt
```

### स्टेप 3: ऐप स्टार्ट करें
```bash
uvicorn main:app --reload
```
अब अपने ब्राउज़र में **`http://localhost:8000`** खोलें! आपका ऐप लाइव चलने लगेगा।

---

## 🐙 2. GitHub पर कैसे अपलोड करें (Push to GitHub)

1. [GitHub.com](https://github.com) पर जाएं और एक **New Repository** बनाएं (जैसे नाम दें: `docstudio`).
2. VS Code टर्मिनल में निम्नलिखित कमांड्स चलाएं:

```bash
# गिट इनिशियलाइज़ करें
git init

# सभी फाइल्स स्टेज करें
git add .

# कमिट करें
git commit -m "Initial commit: DocStudio PDF & PPT Suite"

# ब्रांच का नाम main रखें
git branch -M main

# अपनी गिटहब रिपॉजिटरी का URL जोड़ें (अपना यूज़रनेम डालें):
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/docstudio.git

# कोड पुश करें
git push -u origin main
```

---

## 🌐 3. Render.com पर फ्री वेबसाइट कैसे लाइव करें (Deployment)

1. **[Render.com](https://render.com)** पर जाएं और अपने GitHub अकाउंट से Sign In करें।
2. **New +** बटन पर क्लिक करके **"Web Service"** चुनें।
3. अपनी GitHub रिपॉजिटरी (`docstudio`) को कनेक्ट करें।
4. सेटिंग्स में निम्नलिखित भरें:
   * **Name:** `docstudio` (या अपनी पसंद का नाम)
   * **Region:** कोई भी (जैसे `Singapore` या `Oregon`)
   * **Branch:** `main`
   * **Runtime:** `Python 3`
   * **Build Command:**
     ```bash
     pip install -r requirements.txt
     ```
   * **Start Command:**
     ```bash
     uvicorn main:app --host 0.0.0.0 --port $PORT
     ```
   * **Instance Type:** `Free`
5. नीचे **"Create Web Service"** पर क्लिक कर दें!

2-3 मिनट में Render आपकी वेबसाइट को बिल्ड करके एक लाइव पब्लिक URL (जैसे `https://docstudio.onrender.com`) दे देगा जिसे आप दुनिया में किसी को भी शेयर कर सकते हैं! 🎉

---

## 📁 प्रोजेक्ट स्ट्रक्चर (Project Structure)

```
doc-studio/
├── main.py                 # FastAPI सर्वर (UI + API Endpoints)
├── requirements.txt         # Python डिपेंडेंसीज़
├── render.yaml             # Render 1-Click डिप्लॉय कॉन्फ़िगरेशन
├── .gitignore              # Git अनचाही फाइल्स रोकने के लिए
├── README.md               # संपूर्ण गाइड
├── static/
│   ├── css/
│   │   └── style.css       # कस्टम स्टाइलिंग
│   └── js/
│       ├── app.js          # मेन ऐप और कन्वर्टर कंट्रोलर
│       ├── pdf_editor.js   # PDF व्यूअर और एनोटेशन कैनवस
│       └── ppt_editor.js   # PPT स्लाइड मेकर और .pptx एक्सपोर्टर
└── templates/
    └── index.html          # फुल रिस्पॉन्सिव वेब डैशबोर्ड
```
