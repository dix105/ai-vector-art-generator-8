document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // GLOBAL CONFIGURATION & STATE
    // ==========================================
    const API_CONFIG = {
        effectId: 'photoToVectorArt',
        model: 'image-effects',
        toolType: 'image-effects',
        userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
        endpoints: {
            upload: 'https://api.chromastudio.ai/get-emd-upload-url',
            imageGen: 'https://api.chromastudio.ai/image-gen',
            videoGen: 'https://api.chromastudio.ai/video-gen',
            cdn: 'https://contents.maxstudio.ai'
        }
    };

    let currentUploadedUrl = null;

    // ==========================================
    // 1. MOBILE MENU TOGGLE
    // ==========================================
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenu = document.querySelector('.mobile-menu');
    
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            const isVisible = mobileMenu.style.display === 'block';
            mobileMenu.style.display = isVisible ? 'none' : 'block';
            
            // Animate Burger Icon
            const spans = menuBtn.querySelectorAll('span');
            if (!isVisible) {
                spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });

        // Close menu when clicking a link
        document.querySelectorAll('.mobile-nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.style.display = 'none';
                // Reset burger
                const spans = menuBtn.querySelectorAll('span');
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            });
        });
    }

    // ==========================================
    // 2. ACCORDION LOGIC
    // ==========================================
    const accordions = document.querySelectorAll('.accordion-header');
    
    accordions.forEach(acc => {
        acc.addEventListener('click', function() {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    });

    // ==========================================
    // 3. API FUNCTIONS (REAL IMPLEMENTATION)
    // ==========================================

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            `${API_CONFIG.endpoints.upload}?fileName=` + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = `${API_CONFIG.endpoints.cdn}/` + fileName;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        const isVideo = API_CONFIG.model === 'video-effects';
        const endpoint = isVideo ? API_CONFIG.endpoints.videoGen : API_CONFIG.endpoints.imageGen;
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl],
                effectId: API_CONFIG.effectId,
                userId: API_CONFIG.userId,
                removeWatermark: true,
                model: 'video-effects',
                isPrivate: true
            };
        } else {
            body = {
                model: API_CONFIG.model,
                toolType: API_CONFIG.toolType,
                effectId: API_CONFIG.effectId,
                imageUrl: imageUrl,
                userId: API_CONFIG.userId,
                removeWatermark: true,
                isPrivate: true
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    // Poll job status until completed or failed
    async function pollJobStatus(jobId) {
        const isVideo = API_CONFIG.model === 'video-effects';
        const baseUrl = isVideo ? API_CONFIG.endpoints.videoGen : API_CONFIG.endpoints.imageGen;
        const POLL_INTERVAL = 2000;
        const MAX_POLLS = 60;
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${API_CONFIG.userId}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // ==========================================
    // 4. UI HELPER FUNCTIONS
    // ==========================================

    const fileInput = document.getElementById('file-input');
    const uploadZone = document.getElementById('upload-zone');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const resultContainer = document.getElementById('result-container');
    const resultImage = document.getElementById('result-image');
    const downloadBtn = document.getElementById('download-btn');
    const loader = document.querySelector('.loader'); // Existing loader class
    const btnText = document.querySelector('.btn-text');

    function showLoading() {
        if (loader) loader.classList.remove('hidden');
        if (generateBtn) generateBtn.disabled = true;
    }

    function hideLoading() {
        if (loader) loader.classList.add('hidden');
        if (generateBtn) generateBtn.disabled = false;
    }

    function updateStatus(text) {
        if (btnText) btnText.textContent = text;
    }

    function showError(msg) {
        alert('Error: ' + msg);
    }

    function showPreview(url) {
        if (previewImage) {
            previewImage.src = url;
            if (previewContainer) previewContainer.classList.remove('hidden');
        }
    }

    function showResultMedia(url) {
        const container = resultContainer;
        
        if (!container) return;
        
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        // Ensure result image element exists (using the one from DOM)
        const resultImg = document.getElementById('result-image');
        
        if (isVideo) {
            if (resultImg) resultImg.style.display = 'none';
            
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.className = resultImg ? resultImg.className : 'w-full h-auto rounded-lg';
                video.style.maxWidth = '100%';
                // Insert video where image was
                if (resultImg && resultImg.parentNode) {
                    resultImg.parentNode.insertBefore(video, resultImg);
                } else {
                    container.appendChild(video);
                }
            }
            video.src = url;
            video.style.display = 'block';
        } else {
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            if (resultImg) {
                resultImg.style.display = 'block';
                // NO crossOrigin to prevent CORS blocking on simple display
                resultImg.src = url + '?t=' + new Date().getTime();
            }
        }
        
        if (resultContainer) resultContainer.classList.remove('hidden');
    }

    function enableGenerateButton() {
        if (generateBtn) {
            generateBtn.disabled = false;
            if (btnText) btnText.textContent = "Generate Vector Art";
        }
    }

    function showDownloadButton(url) {
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.style.display = 'inline-block';
        }
    }

    // ==========================================
    // 5. WIRING HANDLERS
    // ==========================================

    // Handler when file is selected - uploads immediately
    async function handleFileSelect(file) {
        if (!file) return;
        
        try {
            showLoading();
            updateStatus('UPLOADING...');
            
            // Upload immediately when file is selected
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show the uploaded image preview
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            hideLoading();
            
            // Enable the generate button
            enableGenerateButton();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // Handler when Generate button is clicked
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert('Please upload an image first');
            return;
        }
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // Step 1: Submit job to ChromaStudio API
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('JOB QUEUED...');
            
            // Step 2: Poll for completion
            const result = await pollJobStatus(jobData.jobId);
            
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                console.error('Response:', result);
                throw new Error('No image URL in response');
            }
            
            console.log('Result media URL:', resultUrl);
            
            // Update stored URL for download
            currentUploadedUrl = resultUrl; // Update current for potential re-use logic
            
            // Step 3: Display result
            showResultMedia(resultUrl);
            
            updateStatus('Generate Vector Art'); // Reset text
            hideLoading();
            showDownloadButton(resultUrl);
            
        } catch (error) {
            hideLoading();
            updateStatus('Generate Vector Art'); // Reset text on error
            showError(error.message);
        }
    }

    // ==========================================
    // 6. EVENT LISTENERS
    // ==========================================

    // File Input Change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Drag & Drop
    if (uploadZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadZone.addEventListener(eventName, () => uploadZone.classList.add('drag-over'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, () => uploadZone.classList.remove('drag-over'));
        });

        uploadZone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        });
        
        // Click to upload
        uploadZone.addEventListener('click', (e) => {
            // Avoid triggering if clicking reset button which might be inside zone area in some layouts
            if(e.target !== resetBtn && fileInput) fileInput.click();
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentUploadedUrl = null;
            if (fileInput) fileInput.value = '';
            if (previewImage) previewImage.src = '';
            if (previewContainer) previewContainer.classList.add('hidden');
            if (generateBtn) generateBtn.disabled = true;
            if (resultContainer) resultContainer.classList.add('hidden');
            if (downloadBtn) downloadBtn.style.display = 'none';
            if (btnText) btnText.textContent = "Generate Vector Art";
        });
    }

    // Download Button - Robust Strategy
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            // Helper to trigger download from blob
            function downloadBlob(blob, filename) {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            }
            
            // Helper to get extension from URL or content-type
            function getExtension(url, contentType) {
                if (contentType) {
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
                    if (contentType.includes('png')) return 'png';
                    if (contentType.includes('webp')) return 'webp';
                    if (contentType.includes('mp4')) return 'mp4';
                    if (contentType.includes('webm')) return 'webm';
                    if (contentType.includes('svg')) return 'svg';
                }
                const match = url.match(/\.(jpe?g|png|webp|mp4|webm|svg)/i);
                return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
            }
            
            try {
                // STRATEGY 1: Use ChromaStudio download proxy
                const proxyUrl = 'https://api.chromastudio.ai/download-proxy?url=' + encodeURIComponent(url);
                
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy failed: ' + response.status);
                
                const blob = await response.blob();
                const ext = getExtension(url, response.headers.get('content-type'));
                downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.' + ext);
                
            } catch (proxyErr) {
                console.warn('Proxy download failed, trying direct fetch:', proxyErr.message);
                
                // STRATEGY 2: Try direct fetch
                try {
                    const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                    const response = await fetch(fetchUrl, { mode: 'cors' });
                    
                    if (response.ok) {
                        const blob = await response.blob();
                        const ext = getExtension(url, response.headers.get('content-type'));
                        downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.' + ext);
                        return;
                    }
                    throw new Error('Direct fetch failed: ' + response.status);
                } catch (fetchErr) {
                    console.warn('Direct fetch failed:', fetchErr.message);
                    alert('Download failed due to browser security restrictions. Please right-click the result image and select "Save Image As".');
                }
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // 7. MODAL LOGIC (PRIVACY & TERMS)
    // ==========================================
    const privacyLink = document.getElementById('privacy-link');
    const termsLink = document.getElementById('terms-link');
    const privacyModal = document.getElementById('privacy-modal');
    const termsModal = document.getElementById('terms-modal');
    const closeButtons = document.querySelectorAll('.modal-close');

    function openModal(modal) {
        if(modal) {
            modal.style.display = "block";
            document.body.style.overflow = "hidden";
        }
    }

    function closeModal() {
        if(privacyModal) privacyModal.style.display = "none";
        if(termsModal) termsModal.style.display = "none";
        document.body.style.overflow = "auto";
    }

    if(privacyLink) privacyLink.addEventListener('click', (e) => { e.preventDefault(); openModal(privacyModal); });
    if(termsLink) termsLink.addEventListener('click', (e) => { e.preventDefault(); openModal(termsModal); });

    closeButtons.forEach(btn => btn.addEventListener('click', closeModal));

    window.addEventListener('click', (e) => {
        if (e.target == privacyModal || e.target == termsModal) {
            closeModal();
        }
    });

    // ==========================================
    // 8. SCROLL REVEAL ANIMATIONS
    // ==========================================
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animateElements = document.querySelectorAll('.benefit-card, .step-card, .testimonial-card, .gallery-item');
    
    animateElements.forEach(el => {
        el.style.opacity = "0";
        el.style.transform = "translateY(20px)";
        el.style.transition = "opacity 0.6s ease-out, transform 0.6s ease-out";
        observer.observe(el);
    });
});