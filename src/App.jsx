import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import jsPDF from 'jspdf';
import { createWorker } from 'tesseract.js';
import { gapi } from 'gapi-script';
import './App.css';

function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [processedImages, setProcessedImages] = useState([]);
  const [extractedText, setExtractedText] = useState('');
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [savedDocuments, setSavedDocuments] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('trabalho');
  const [documentName, setDocumentName] = useState('');
  const [selectedDocText, setSelectedDocText] = useState(null);
  const [currentView, setCurrentView] = useState('scanner');
  const [googleUser, setGoogleUser] = useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [uploadToDrive, setUploadToDrive] = useState(false);

  const categories = ['trabalho', 'estudos', 'diversos'];

  // Google Drive API configuration
  const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
  const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
  const SCOPES = 'https://www.googleapis.com/auth/drive.file';

  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: 'environment'
  };

  // Load saved documents from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('scannerDocuments');
    if (saved) {
      setSavedDocuments(JSON.parse(saved));
    }
  }, []);

  // Initialize Google API
  useEffect(() => {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE' || API_KEY === 'YOUR_GOOGLE_API_KEY_HERE') {
      console.warn('Google API credentials are not configured. Google Drive integration is disabled.');
      return;
    }

    const initClient = () => {
      gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES,
      }).then(() => {
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
      }).catch((error) => {
        console.error('Error initializing Google API:', error);
      });
    };

    const loadGoogleApi = () => {
      const gapiInstance = window.gapi || gapi;
      if (!gapiInstance) {
        console.warn('gapi não disponível');
        return;
      }
      gapiInstance.load('client:auth2', initClient);
    };

    if (window.gapi) {
      loadGoogleApi();
    } else {
      window.addEventListener('load', loadGoogleApi);
      return () => window.removeEventListener('load', loadGoogleApi);
    }
  }, []);

  const updateSigninStatus = (isSignedIn) => {
    setIsGoogleSignedIn(isSignedIn);
    if (isSignedIn && window.gapi) {
      const user = gapi.auth2.getAuthInstance().currentUser.get();
      setGoogleUser(user.getBasicProfile());
    } else {
      setGoogleUser(null);
      setUploadToDrive(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!window.gapi) {
      alert('Google API ainda não foi carregada. Recarregue a página e tente novamente.');
      return;
    }

    const authInstance = gapi.auth2.getAuthInstance();
    if (!authInstance) {
      alert('Não foi possível iniciar o login do Google.');
      return;
    }

    try {
      await authInstance.signIn();
      updateSigninStatus(authInstance.isSignedIn.get());
    } catch (error) {
      console.error('Erro ao conectar com Google Drive:', error);
      alert('Falha ao conectar com Google Drive. Verifique as permissões.');
    }
  };

  const handleGoogleSignOut = async () => {
    if (!window.gapi) return;
    const authInstance = gapi.auth2.getAuthInstance();
    if (!authInstance) return;
    await authInstance.signOut();
    setIsGoogleSignedIn(false);
    setGoogleUser(null);
    setUploadToDrive(false);
  };

  const uploadToGoogleDrive = async (file, fileName) => {
    if (!window.gapi) throw new Error('Google API não carregada');
    const authInstance = gapi.auth2.getAuthInstance();
    if (!authInstance) throw new Error('Instância de autenticação do Google não disponível');

    const accessToken = authInstance.currentUser.get().getAuthResponse().access_token;
    const metadata = {
      name: fileName,
      mimeType: file.type,
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return response.json();
  };

  // Save to localStorage
  const saveToStorage = useCallback((docs) => {
    localStorage.setItem('scannerDocuments', JSON.stringify(docs));
  }, []);

  const startCamera = useCallback(() => {
    setIsCameraOn(true);
  }, []);

  const stopCamera = useCallback(() => {
    setIsCameraOn(false);
  }, []);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot();
    setCapturedImages(prev => [...prev, imageSrc]);
    processImage(imageSrc);
  }, []);

  const processImage = useCallback(async (imageSrc) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = async () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // Apply basic enhancements: brightness, contrast, and centering simulation
      ctx.filter = 'brightness(1.1) contrast(1.2) saturate(1.1)';
      ctx.drawImage(img, 0, 0);

      // Simple centering by cropping edges (basic simulation)
      const croppedWidth = img.width * 0.9;
      const croppedHeight = img.height * 0.9;
      const offsetX = (img.width - croppedWidth) / 2;
      const offsetY = (img.height - croppedHeight) / 2;

      const imageData = ctx.getImageData(offsetX, offsetY, croppedWidth, croppedHeight);
      canvas.width = croppedWidth;
      canvas.height = croppedHeight;
      ctx.putImageData(imageData, 0, 0);

      const processedSrc = canvas.toDataURL('image/jpeg', 0.9);
      setProcessedImages(prev => [...prev, processedSrc]);

      // Run OCR on the processed image
      await runOCR(processedSrc);
    };
    img.src = imageSrc;
  }, []);

  const runOCR = useCallback(async (imageSrc) => {
    setIsProcessingOCR(true);
    const worker = createWorker({
      logger: (m) => console.log(m),
    });
    await worker.load();
    await worker.loadLanguage('por');
    await worker.initialize('por');
    const { data: { text } } = await worker.recognize(imageSrc);
    await worker.terminate();
    setExtractedText(prev => prev + text + '\n\n');
    setIsProcessingOCR(false);
  }, []);

  const saveDocument = useCallback(async (uploadToDrive = false) => {
    if (processedImages.length === 0 || !documentName.trim()) return;

    const pdf = new jsPDF();
    processedImages.forEach((imgSrc, index) => {
      if (index > 0) pdf.addPage();
      pdf.addImage(imgSrc, 'JPEG', 10, 10, 190, 140);
    });

    const pdfBlob = pdf.output('blob');
    const newDoc = {
      id: Date.now(),
      name: documentName,
      category: selectedCategory,
      pdfBlob: pdfBlob,
      date: new Date().toISOString(),
      preview: processedImages[0],
      extractedText: extractedText
    };

    const updatedDocs = [...savedDocuments, newDoc];
    setSavedDocuments(updatedDocs);
    saveToStorage(updatedDocs);

    if (uploadToDrive && isGoogleSignedIn) {
      try {
        const file = new File([pdfBlob], `${documentName}.pdf`, { type: 'application/pdf' });
        await uploadToGoogleDrive(file, `${documentName}.pdf`);
        alert('Documento salvo localmente e enviado para Google Drive!');
      } catch (error) {
        alert('Documento salvo localmente, mas falhou o upload para Google Drive.');
      }
    } else {
      alert('Documento salvo com sucesso!');
    }

    // Reset
    setCapturedImages([]);
    setProcessedImages([]);
    setDocumentName('');
  }, [processedImages, documentName, selectedCategory, savedDocuments, saveToStorage, extractedText]);

  const deleteDocument = useCallback((id) => {
    const updatedDocs = savedDocuments.filter(doc => doc.id !== id);
    setSavedDocuments(updatedDocs);
    saveToStorage(updatedDocs);
  }, [savedDocuments, saveToStorage]);

  const showDocumentText = useCallback((doc) => {
    setSelectedDocText(doc);
  }, []);

  const closeTextModal = useCallback(() => {
    setSelectedDocText(null);
  }, []);

  const clearImages = useCallback(() => {
    setCapturedImages([]);
    setProcessedImages([]);
    setExtractedText('');
  }, []);

  const shareDocument = useCallback(async (doc) => {
    const file = new File([doc.pdfBlob], `${doc.name}.pdf`, { type: 'application/pdf' });

    if (navigator.share) {
      try {
        await navigator.share({
          title: doc.name,
          files: [file],
        });
      } catch (err) {
        console.error('Erro no compartilhamento:', err);
      }
    } else {
      const url = URL.createObjectURL(file);
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Documento: ${doc.name}`)} ${encodeURIComponent(url)}`;
      const emailUrl = `mailto:?subject=${encodeURIComponent(doc.name)}&body=${encodeURIComponent('Documento escaneado: ' + url)}`;

      if (window.confirm('Compartilhar via WhatsApp? Clique em Cancelar para email.')) {
        window.open(whatsappUrl, '_blank');
      } else {
        window.open(emailUrl, '_blank');
      }
    }
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>Document Scanner</h1>
        <p>Escaneie documentos rapidamente com seu dispositivo móvel</p>
        <div className="header-controls">
          <div className="google-auth">
            {isGoogleSignedIn ? (
              <div className="google-user">
                <span>Olá, {googleUser?.getName()}</span>
                <button className="btn small" onClick={handleGoogleSignOut}>
                  Desconectar Google
                </button>
              </div>
            ) : (
              <button className="btn small" onClick={handleGoogleSignIn}>
                Conectar Google Drive
              </button>
            )}
          </div>
          <nav className="nav">
            <button
              className={`nav-btn ${currentView === 'scanner' ? 'active' : ''}`}
              onClick={() => setCurrentView('scanner')}
            >
              Scanner
            </button>
            <button
              className={`nav-btn ${currentView === 'documents' ? 'active' : ''}`}
              onClick={() => setCurrentView('documents')}
            >
              Documentos Salvos
            </button>
          </nav>
        </div>
      </header>

      {currentView === 'scanner' && (
        <div className="scanner-container">
          <section className="camera-section">
            <h2>Câmera</h2>
            <div className="video-container">
              {isCameraOn ? (
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  style={{ width: '100%', height: 'auto' }}
                />
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                  Câmera desativada
                </div>
              )}
            </div>
            <div className="controls">
              {!isCameraOn ? (
                <button className="btn" onClick={startCamera}>
                  Iniciar Câmera
                </button>
              ) : (
                <>
                  <button className="btn" onClick={capture}>
                    Capturar
                  </button>
                  <button className="btn" onClick={stopCamera}>
                    Parar Câmera
                  </button>
                </>
              )}
            </div>
          </section>

          {processedImages.length > 0 && (
            <section className="preview-section">
              <h2>Imagens Processadas ({processedImages.length})</h2>
              <div className="preview-container">
                {processedImages.map((img, index) => (
                  <img
                    key={index}
                    src={img}
                    alt={`Processada ${index + 1}`}
                    className="preview-img"
                  />
                ))}
              </div>

              <div className="ocr-section">
                <h3>Texto Extraído</h3>
                {isProcessingOCR ? (
                  <p>Processando OCR...</p>
                ) : (
                  <textarea
                    value={extractedText}
                    readOnly
                    className="ocr-textarea"
                    placeholder="Texto extraído aparecerá aqui..."
                  />
                )}
              </div>

              <div className="save-section">
                <input
                  type="text"
                  placeholder="Nome do documento"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  className="doc-name-input"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="category-select"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                  ))}
                </select>
                {isGoogleSignedIn && (
                  <label className="upload-checkbox">
                    <input
                      type="checkbox"
                      checked={uploadToDrive}
                      onChange={(e) => setUploadToDrive(e.target.checked)}
                    />
                    Enviar para Google Drive
                  </label>
                )}
                <div className="controls">
                  <button className="btn save-btn" onClick={() => saveDocument(uploadToDrive)} disabled={!documentName.trim()}>
                    Salvar Documento
                  </button>
                  <button className="btn" onClick={clearImages}>
                    Limpar
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {currentView === 'documents' && (
        <div className="documents-container">
          <h2>Documentos Salvos</h2>
          {categories.map(category => (
            <div key={category} className="category-section">
              <h3>{category.charAt(0).toUpperCase() + category.slice(1)}</h3>
              <div className="documents-list">
                {savedDocuments
                  .filter(doc => doc.category === category)
                  .map(doc => (
                    <div key={doc.id} className="document-item">
                      <img src={doc.preview} alt={doc.name} className="doc-preview" />
                      <div className="doc-info">
                        <h4>{doc.name}</h4>
                        <p>{new Date(doc.date).toLocaleDateString()}</p>
                      </div>
                      <div className="doc-actions">
                        <button className="btn small" onClick={() => showDocumentText(doc)}>
                          Ver Texto
                        </button>
                        <button className="btn small" onClick={() => shareDocument(doc)}>
                          Compartilhar
                        </button>
                        <button className="btn small danger" onClick={() => deleteDocument(doc.id)}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                {savedDocuments.filter(doc => doc.category === category).length === 0 && (
                  <p className="no-docs">Nenhum documento nesta categoria</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDocText && (
        <div className="modal-overlay" onClick={closeTextModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDocText.name} - Texto Extraído</h3>
              <button className="close-btn" onClick={closeTextModal}>×</button>
            </div>
            <div className="modal-body">
              <textarea
                value={selectedDocText.extractedText || 'Nenhum texto extraído'}
                readOnly
                className="modal-textarea"
              />
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default App;
