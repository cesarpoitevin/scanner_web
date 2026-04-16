import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import jsPDF from 'jspdf';
import { gapi } from 'gapi-script';
import './App.css';

function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);

  // Camera
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');

  // Images & document
  const [processedImages, setProcessedImages] = useState([]);
  const [scanFilter, setScanFilter] = useState('enhanced');
  const [documentName, setDocumentName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Geral');
  const [isProcessing, setIsProcessing] = useState(false);

  // Saved documents
  const [savedDocuments, setSavedDocuments] = useState([]);
  const [currentView, setCurrentView] = useState('scanner');

  // Modals
  const [shareModal, setShareModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Google Drive (lazy)
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);

  const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

  const categories = ['Geral', 'Trabalho', 'Estudos', 'Pessoal', 'Financeiro'];

  const filters = [
    { value: 'original', label: 'Original' },
    { value: 'grayscale', label: 'Cinza' },
    { value: 'enhanced', label: 'Nítido' },
    { value: 'bw', label: 'P&B' },
  ];

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode,
  };

  // Load saved documents
  useEffect(() => {
    try {
      const saved = localStorage.getItem('scannerDocuments');
      if (saved) setSavedDocuments(JSON.parse(saved));
    } catch (e) {
      console.error('Error loading saved documents:', e);
    }
  }, []);

  // Detect torch support when camera starts
  const handleCameraStart = useCallback(() => {
    const stream = webcamRef.current?.video?.srcObject;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const caps = track?.getCapabilities?.();
    if (caps?.torch) setTorchSupported(true);
  }, []);

  const toggleTorch = useCallback(async () => {
    const stream = webcamRef.current?.video?.srcObject;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (e) {
      console.warn('Torch not supported:', e);
    }
  }, [torchOn]);

  const flipCamera = useCallback(() => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, []);

  const saveToStorage = useCallback((docs) => {
    try {
      localStorage.setItem('scannerDocuments', JSON.stringify(docs));
    } catch (e) {
      console.error('Error saving:', e);
    }
  }, []);

  // Image processing / filters
  const applyFilter = useCallback((imageData, filter) => {
    const data = imageData.data;

    if (filter === 'original') return imageData;

    // Grayscale (all non-original modes start here)
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = g;
    }

    if (filter === 'grayscale') return imageData;

    if (filter === 'enhanced') {
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.min(255, Math.max(0, (data[i] - 128) * 1.5 + 128));
        data[i] = data[i + 1] = data[i + 2] = v;
      }
      return imageData;
    }

    if (filter === 'bw') {
      // Strong contrast stretch
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.min(255, Math.max(0, (data[i] - 128) * 2.0 + 128));
        data[i] = data[i + 1] = data[i + 2] = v;
      }
      // Otsu threshold
      const hist = new Array(256).fill(0);
      const total = data.length / 4;
      for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sumB = 0, wB = 0, maxVar = 0, thresh = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const variance = wB * wF * (mB - mF) ** 2;
        if (variance > maxVar) { maxVar = variance; thresh = t; }
      }
      for (let i = 0; i < data.length; i += 4) {
        const val = data[i] > thresh ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = val;
      }
      return imageData;
    }

    return imageData;
  }, []);

  const processImage = useCallback((imageSrc) => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(2.5, Math.max(1, 2000 / img.width));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const processed = applyFilter(imageData, scanFilter);
        ctx.putImageData(processed, 0, 0);

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = imageSrc;
    });
  }, [scanFilter, applyFilter]);

  const capture = useCallback(async () => {
    if (!webcamRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;
      const processed = await processImage(imageSrc);
      setProcessedImages(prev => [...prev, processed]);
    } finally {
      setIsProcessing(false);
    }
  }, [processImage, isProcessing]);

  const removeImage = useCallback((index) => {
    setProcessedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearAll = useCallback(() => {
    setProcessedImages([]);
    setDocumentName('');
  }, []);

  const saveDocument = useCallback(async () => {
    if (processedImages.length === 0 || !documentName.trim()) return;
    setIsProcessing(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 8;

      for (let i = 0; i < processedImages.length; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(processedImages[i], 'JPEG', margin, margin, pw - 2 * margin, ph - 2 * margin);
      }

      const pdfBlob = pdf.output('blob');
      const newDoc = {
        id: Date.now(),
        name: documentName.trim(),
        category: selectedCategory,
        pdfBlob,
        date: new Date().toISOString(),
        preview: processedImages[0],
        pageCount: processedImages.length,
      };

      const updated = [...savedDocuments, newDoc];
      setSavedDocuments(updated);
      saveToStorage(updated);
      setProcessedImages([]);
      setDocumentName('');
      setCurrentView('documents');
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  }, [processedImages, documentName, selectedCategory, savedDocuments, saveToStorage]);

  const deleteDocument = useCallback((id) => {
    const updated = savedDocuments.filter(d => d.id !== id);
    setSavedDocuments(updated);
    saveToStorage(updated);
    setDeleteConfirm(null);
  }, [savedDocuments, saveToStorage]);

  const downloadDocument = useCallback((doc) => {
    const url = URL.createObjectURL(doc.pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Google Drive — lazy initialization, only when user clicks "Google Drive"
  const signInAndUploadToDrive = useCallback(async (doc) => {
    if (!CLIENT_ID || !API_KEY) {
      alert('Google Drive não configurado. Verifique as variáveis de ambiente.');
      return;
    }
    setIsDriveLoading(true);
    try {
      await new Promise((resolve, reject) => {
        if (!window.gapi) { reject(new Error('Google API não carregada')); return; }
        gapi.load('client:auth2', () => {
          gapi.client.init({
            apiKey: API_KEY,
            clientId: CLIENT_ID,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            scope: 'https://www.googleapis.com/auth/drive.file',
          }).then(resolve).catch(reject);
        });
      });

      const auth = gapi.auth2.getAuthInstance();
      if (!auth.isSignedIn.get()) await auth.signIn();
      setIsGoogleSignedIn(true);
      setGoogleUser(auth.currentUser.get().getBasicProfile());

      const token = auth.currentUser.get().getAuthResponse().access_token;
      const file = new File([doc.pdfBlob], `${doc.name}.pdf`, { type: 'application/pdf' });
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: `${doc.name}.pdf` })], { type: 'application/json' }));
      form.append('file', file);

      const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!resp.ok) throw new Error('Falha no upload para o Drive');

      alert(`"${doc.name}" enviado ao Google Drive com sucesso!`);
      setShareModal(null);
    } catch (e) {
      alert('Erro ao enviar para o Drive: ' + e.message);
    } finally {
      setIsDriveLoading(false);
    }
  }, [CLIENT_ID, API_KEY]);

  const shareViaWhatsApp = useCallback((doc) => {
    const url = URL.createObjectURL(doc.pdfBlob);
    window.open(`https://wa.me/?text=${encodeURIComponent(doc.name + ' - ' + url)}`, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }, []);

  const shareViaEmail = useCallback((doc) => {
    const url = URL.createObjectURL(doc.pdfBlob);
    window.open(`mailto:?subject=${encodeURIComponent(doc.name)}&body=${encodeURIComponent('Segue o documento escaneado:\n' + url)}`, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }, []);

  const shareNative = useCallback(async (doc) => {
    if (!navigator.share) return false;
    try {
      const file = new File([doc.pdfBlob], `${doc.name}.pdf`, { type: 'application/pdf' });
      await navigator.share({ title: doc.name, files: [file] });
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Scanner</h1>
        </div>
        <nav className="app-nav">
          <button
            className={`nav-btn ${currentView === 'scanner' ? 'active' : ''}`}
            onClick={() => setCurrentView('scanner')}
          >
            Câmera
          </button>
          <button
            className={`nav-btn ${currentView === 'documents' ? 'active' : ''}`}
            onClick={() => setCurrentView('documents')}
          >
            Documentos
            {savedDocuments.length > 0 && (
              <span className="nav-badge">{savedDocuments.length}</span>
            )}
          </button>
        </nav>
      </header>

      {/* ── SCANNER VIEW ── */}
      {currentView === 'scanner' && (
        <div className="scanner-view">

          {/* Camera area */}
          <div className="camera-area">
            {isCameraOn ? (
              <>
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/png"
                  videoConstraints={videoConstraints}
                  className="camera-feed"
                  onUserMedia={handleCameraStart}
                />
                {/* Document framing overlay */}
                <div className="camera-overlay">
                  <div className="frame-guide">
                    <span className="corner tl" />
                    <span className="corner tr" />
                    <span className="corner bl" />
                    <span className="corner br" />
                    <span className="frame-hint">Enquadre o documento</span>
                  </div>
                  {showGrid && (
                    <div className="grid-overlay">
                      <div className="grid-line h" style={{ top: '33.3%' }} />
                      <div className="grid-line h" style={{ top: '66.6%' }} />
                      <div className="grid-line v" style={{ left: '33.3%' }} />
                      <div className="grid-line v" style={{ left: '66.6%' }} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="camera-placeholder" onClick={() => setIsCameraOn(true)}>
                <div className="camera-icon-big">📷</div>
                <p>Toque para ativar a câmera</p>
                <span className="hint-text">Posicione o documento em superfície plana com boa iluminação</span>
              </div>
            )}
          </div>

          {/* Camera toolbar */}
          {isCameraOn && (
            <>
              <div className="camera-toolbar">
                <button
                  className={`tool-btn ${showGrid ? 'active' : ''}`}
                  onClick={() => setShowGrid(g => !g)}
                  title="Grade de enquadramento"
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="1"/>
                    <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                    <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                  </svg>
                  <span>Grade</span>
                </button>

                <button
                  className="capture-btn"
                  onClick={capture}
                  disabled={isProcessing}
                  title="Capturar"
                >
                  <span className="capture-ring" />
                  <span className="capture-dot" />
                </button>

                <button
                  className={`tool-btn ${torchOn ? 'active' : ''} ${!torchSupported ? 'disabled' : ''}`}
                  onClick={toggleTorch}
                  title="Lanterna"
                  disabled={!torchSupported}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 2l4 6h-2v8l-4-8h2z"/>
                    <path d="M13 10h3l-6 12v-8h3z" fill={torchOn ? 'currentColor' : 'none'}/>
                  </svg>
                  <span>Flash</span>
                </button>
              </div>

              {/* Filter bar */}
              <div className="filter-bar">
                {filters.map(f => (
                  <button
                    key={f.value}
                    className={`filter-btn ${scanFilter === f.value ? 'active' : ''}`}
                    onClick={() => setScanFilter(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Tips */}
              <div className="scan-tips">
                <span>💡 Dicas: superfície plana · boa iluminação · câmera paralela ao documento</span>
              </div>
            </>
          )}

          {/* Captured pages */}
          {processedImages.length > 0 && (
            <div className="pages-section">
              <div className="pages-header">
                <h3>Páginas capturadas ({processedImages.length})</h3>
                {!isCameraOn && (
                  <button className="btn-add-page" onClick={() => setIsCameraOn(true)}>
                    + Adicionar página
                  </button>
                )}
              </div>

              <div className="pages-grid">
                {processedImages.map((img, i) => (
                  <div key={i} className="page-thumb">
                    <img src={img} alt={`Página ${i + 1}`} />
                    <button className="remove-page-btn" onClick={() => removeImage(i)}>✕</button>
                    <span className="page-number">{i + 1}</span>
                  </div>
                ))}
              </div>

              <div className="save-form">
                <input
                  type="text"
                  placeholder="Nome do documento"
                  value={documentName}
                  onChange={e => setDocumentName(e.target.value)}
                  className="name-input"
                  maxLength={80}
                />
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="cat-select"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="form-actions">
                  <button
                    className="btn-save"
                    onClick={saveDocument}
                    disabled={!documentName.trim() || isProcessing}
                  >
                    {isProcessing ? 'Salvando...' : 'Salvar PDF'}
                  </button>
                  <button className="btn-clear" onClick={clearAll}>
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isCameraOn && processedImages.length === 0 && (
            <div className="empty-scanner">
              <p>Ative a câmera para começar a escanear</p>
            </div>
          )}
        </div>
      )}

      {/* ── DOCUMENTS VIEW ── */}
      {currentView === 'documents' && (
        <div className="docs-view">
          <div className="docs-header">
            <h2>Documentos Salvos</h2>
          </div>

          {savedDocuments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📄</div>
              <p>Nenhum documento salvo ainda</p>
              <button className="btn-save" onClick={() => setCurrentView('scanner')}>
                Escanear primeiro documento
              </button>
            </div>
          ) : (
            <div className="docs-list">
              {savedDocuments.slice().reverse().map(doc => (
                <div key={doc.id} className="doc-card">
                  <div className="doc-thumb-wrap" onClick={() => setPreviewDoc(doc)}>
                    <img src={doc.preview} alt={doc.name} className="doc-thumb" />
                    <span className="doc-pages">{doc.pageCount || 1}p</span>
                  </div>
                  <div className="doc-info">
                    <strong className="doc-name">{doc.name}</strong>
                    <span className="doc-meta">{doc.category} · {new Date(doc.date).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="doc-actions">
                    <button className="action-btn share" onClick={() => setShareModal(doc)} title="Compartilhar">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                      </svg>
                    </button>
                    <button className="action-btn download" onClick={() => downloadDocument(doc)} title="Baixar PDF">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </button>
                    <button className="action-btn delete" onClick={() => setDeleteConfirm(doc.id)} title="Excluir">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SHARE MODAL ── */}
      {shareModal && (
        <div className="modal-overlay" onClick={() => setShareModal(null)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Compartilhar</h3>
              <button className="close-modal" onClick={() => setShareModal(null)}>✕</button>
            </div>
            <p className="share-doc-name">"{shareModal.name}"</p>
            <div className="share-grid">
              <button className="share-opt whatsapp" onClick={() => shareViaWhatsApp(shareModal)}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span>WhatsApp</span>
              </button>

              <button className="share-opt email" onClick={() => shareViaEmail(shareModal)}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#4285F4" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <span>E-mail</span>
              </button>

              <button
                className="share-opt drive"
                onClick={() => signInAndUploadToDrive(shareModal)}
                disabled={isDriveLoading}
              >
                <svg viewBox="0 0 87.3 78" width="28" height="28">
                  <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 52H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                  <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 47.5A9.06 9.06 0 000 52h27.5z" fill="#00AC47"/>
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.65 10.15z" fill="#EA4335"/>
                  <path d="M43.65 25L57.4 0H29.9z" fill="#00832D"/>
                  <path d="M59.8 52H87.3L73.55 28.5H45.5z" fill="#2684FC"/>
                  <path d="M43.65 25L29.9 52H59.8z" fill="#00AC47"/>
                </svg>
                <span>{isDriveLoading ? 'Enviando...' : 'Google Drive'}</span>
              </button>

              <button className="share-opt download" onClick={() => { downloadDocument(shareModal); setShareModal(null); }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#666" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>Baixar PDF</span>
              </button>

              {navigator.share && (
                <button className="share-opt native" onClick={() => shareNative(shareModal)}>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#888" strokeWidth="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  <span>Outras opções</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <p>Excluir este documento permanentemente?</p>
            <div className="confirm-btns">
              <button className="btn-danger" onClick={() => deleteDocument(deleteConfirm)}>Excluir</button>
              <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PREVIEW MODAL ── */}
      {previewDoc && (
        <div className="modal-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="preview-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{previewDoc.name}</h3>
              <button className="close-modal" onClick={() => setPreviewDoc(null)}>✕</button>
            </div>
            <img src={previewDoc.preview} alt={previewDoc.name} className="preview-full" />
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default App;
