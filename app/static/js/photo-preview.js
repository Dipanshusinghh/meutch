/**
 * Photo Preview – Bootstrap 5 Modal Crop Editor
 * Listens for multi-image:edit events, opens a Cropper.js modal,
 * and dispatches multi-image:cropped with the resulting blob.
 * Requires: Cropper.js, Bootstrap 5 JS
 */

(function() {
    'use strict';

    var ROTATION_DELAY = 10;

    var cropper = null;
    var editId = null;
    var editContainer = null;
    var editThumbEl = null;
    var objectUrl = null;
    var modalEl = null;
    var modalInstance = null;
    var cropImage = null;

    // ── helpers ──────────────────────────────────────────────────────

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function(k) {
                if (k === 'textContent') { node.textContent = attrs[k]; }
                else if (k === 'className') { node.className = attrs[k]; }
                else { node.setAttribute(k, attrs[k]); }
            });
        }
        if (children) {
            children.forEach(function(c) {
                if (typeof c === 'string') { node.appendChild(document.createTextNode(c)); }
                else if (c) { node.appendChild(c); }
            });
        }
        return node;
    }

    function icon(faClass) {
        return el('i', { className: 'fas ' + faClass, 'aria-hidden': 'true' });
    }

    function revokeUrl() {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
    }

    function destroyCropper() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
    }

    function zoomToFitContainer(inst) {
        var container = inst.getContainerData();
        var image = inst.getImageData();
        var ratio = image.aspectRatio > 1
            ? container.width / image.width
            : container.height / image.height;
        inst.zoomTo(ratio);
    }

    // ── modal DOM ───────────────────────────────────────────────────

    function buildModal() {
        var rotateLeftBtn = el('button', {
            type: 'button',
            className: 'btn btn-sm btn-outline-secondary crop-rotate-left',
            'aria-label': 'Rotate left'
        }, [icon('fa-undo'), ' Rotate']);

        var rotateRightBtn = el('button', {
            type: 'button',
            className: 'btn btn-sm btn-outline-secondary crop-rotate-right',
            'aria-label': 'Rotate right'
        }, [icon('fa-redo'), ' Rotate']);

        var zoomInBtn = el('button', {
            type: 'button',
            className: 'btn btn-sm btn-outline-secondary crop-zoom-in',
            'aria-label': 'Zoom in'
        }, [icon('fa-search-plus')]);

        var zoomOutBtn = el('button', {
            type: 'button',
            className: 'btn btn-sm btn-outline-secondary crop-zoom-out',
            'aria-label': 'Zoom out'
        }, [icon('fa-search-minus')]);

        var resetBtn = el('button', {
            type: 'button',
            className: 'btn btn-sm btn-outline-secondary crop-reset',
            'aria-label': 'Reset'
        }, [icon('fa-sync-alt')]);

        var toolGroup = el('div', { className: 'd-flex gap-2 flex-wrap me-auto' },
            [rotateLeftBtn, rotateRightBtn, zoomInBtn, zoomOutBtn, resetBtn]);

        var cancelBtn = el('button', {
            type: 'button',
            className: 'btn btn-secondary',
            'data-bs-dismiss': 'modal'
        }, ['Cancel']);

        var applyBtn = el('button', {
            type: 'button',
            className: 'btn btn-primary crop-apply'
        }, ['Apply']);

        cropImage = el('img', {
            id: 'crop-image',
            style: 'max-width: 100%; display: block;',
            alt: 'Crop preview'
        });

        var cropContainer = el('div', {
            className: 'crop-container',
            style: 'max-height: 60vh; overflow: hidden;'
        }, [cropImage]);

        var titleEl = el('h5', { className: 'modal-title', id: 'cropModalLabel' }, ['Edit Photo']);
        var closeBtn = el('button', {
            type: 'button',
            className: 'btn-close',
            'data-bs-dismiss': 'modal',
            'aria-label': 'Close'
        });

        var header = el('div', { className: 'modal-header' }, [titleEl, closeBtn]);
        var body = el('div', { className: 'modal-body' }, [cropContainer]);
        var footer = el('div', { className: 'modal-footer' }, [toolGroup, cancelBtn, applyBtn]);

        var content = el('div', { className: 'modal-content' }, [header, body, footer]);
        var dialog = el('div', { className: 'modal-dialog modal-lg modal-dialog-centered' }, [content]);
        modalEl = el('div', {
            className: 'modal fade',
            id: 'cropModal',
            tabindex: '-1',
            'aria-labelledby': 'cropModalLabel',
            'aria-hidden': 'true'
        }, [dialog]);

        document.body.appendChild(modalEl);

        // ── control handlers ────────────────────────────────────────

        rotateLeftBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!cropper) return;
            var rot = (cropper.getImageData().rotate || 0) - 90;
            cropper.rotateTo(rot);
            setTimeout(function() { zoomToFitContainer(cropper); }, ROTATION_DELAY);
        });

        rotateRightBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!cropper) return;
            var rot = (cropper.getImageData().rotate || 0) + 90;
            cropper.rotateTo(rot);
            setTimeout(function() { zoomToFitContainer(cropper); }, ROTATION_DELAY);
        });

        zoomInBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (cropper) cropper.zoom(0.1);
        });

        zoomOutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (cropper) cropper.zoom(-0.1);
        });

        resetBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!cropper) return;
            var src = cropImage.getAttribute('src');
            destroyCropper();
            initCropper(src);
        });

        applyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            fileInput.value = '';
            currentFile = null;
            hidePreview(previewContainer);
            
            // Trigger change event to update file info display
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        });
        
        // Add form submit handler to ensure cropped image is used
        const form = fileInput.closest('form');
        if (form) {
            // Track if we've already processed the image
            let imageProcessed = false;
            let pendingSubmitter = null;

            // Capture clicked submit button for browsers that don't support e.submitter
            form.querySelectorAll('[type="submit"]').forEach(function(btn) {
                btn.addEventListener('click', function() { pendingSubmitter = btn; });
            });

            form.addEventListener('submit', function(e) {
                // e.submitter is more reliable than click tracking when available
                if (e.submitter) pendingSubmitter = e.submitter;

                if (cropper && currentFile && !imageProcessed) {
                    // Prevent the form from submitting until we process the image
                    e.preventDefault();
                    // Capture now so the async callback uses the correct button
                    const submitter = pendingSubmitter;

                    // Update file input with final cropped/rotated version
                    updateFileInputWithCroppedImage(fileInput, function() {
                        imageProcessed = true;

                        // requestSubmit preserves submitter identity and reruns validation
                        if (typeof form.requestSubmit === 'function') {
                            form.requestSubmit(submitter || undefined);
                            return;
                        }

                        // Legacy fallback: inject button identity as a hidden field before raw submit
                        if (submitter && submitter.name) {
                            const hidden = document.createElement('input');
                            hidden.type = 'hidden';
                            hidden.name = submitter.name;
                            hidden.value = submitter.value || '';
                            form.appendChild(hidden);
                        }

                        HTMLFormElement.prototype.submit.call(form);
                    });
                }
            });
        }
    }

    /**
     * Display an image in the preview
     * @param {File} file - The image file to display
     * @param {HTMLElement} previewImage - The preview image element
     * @param {HTMLElement} previewContainer - The preview container element
     */
    function displayImage(file, previewImage, previewContainer) {
        // Additional security check
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return;
        }
        
        const reader = new FileReader();
        
        reader.onerror = function() {
            Notifications.error('Failed to read image file. Please try another file.');
        };
        
        reader.onload = function(e) {
            // Validate the result is a data URL
            if (!e.target.result || !e.target.result.startsWith('data:image/')) {
                Notifications.error('Failed to load image. Please try another file.');
                return;
            }
            
            // Destroy existing cropper instance
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }

            // Set image source
            previewImage.src = e.target.result;
            previewContainer.style.display = 'block';

            // Clean up previous onload handler to prevent memory leaks
            previewImage.onload = null;
            
            // Wait for image to load before initializing Cropper
            previewImage.onload = function() {
                // Initialize Cropper.js
cropper = new Cropper(previewImage, {
                    viewMode: 1,
                    dragMode: 'move',
                    aspectRatio: NaN,
                    autoCropArea: 1,
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: false,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: false,
                    responsive: true,
                    background: false,
                    zoomable: true,
                    zoomOnWheel: true,
                    zoomOnTouch: true,
                    rotatable: true,
                    checkOrientation: false,
                    checkCrossOrigin: false,
                    minCropBoxWidth: 10,
                    minCropBoxHeight: 10,
                    minContainerWidth: 200,
                    minContainerHeight: 200
                });
            };
        };
        reader.readAsDataURL(file);
    }

    /**
     * Hide the preview container
     * @param {HTMLElement} previewContainer - The preview container element
     */
    function hidePreview(previewContainer) {
        previewContainer.style.display = 'none';
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        modalInstance.show();

        // Wait until modal is visible so Cropper can measure the container
        modalEl.addEventListener('shown.bs.modal', function onShown() {
            modalEl.removeEventListener('shown.bs.modal', onShown);
            initCropper(src);
        });
    }

    function hideModal() {
        if (modalInstance) {
            modalInstance.hide();
        }
    }

    // ── edit listener ───────────────────────────────────────────────

    function onEditRequested(e) {
        var detail = e.detail || {};
        editId = detail.id;
        editContainer = detail.container || null;
        editThumbEl = detail.thumbEl || null;

        revokeUrl();

        if (detail.file) {
            objectUrl = URL.createObjectURL(detail.file);
            showModal(objectUrl);
        } else if (detail.url) {
            // Same-origin URLs (local dev storage) can be fetched directly.
            // Cross-origin CDN URLs go through the server-side proxy to avoid
            // CORS cache poisoning from DO Spaces CDN.
            var isSameOrigin = false;
            try {
                isSameOrigin = new URL(detail.url, window.location.origin).origin === window.location.origin;
            } catch (_) { /* treat as cross-origin */ }

            var fetchUrl = isSameOrigin
                ? detail.url
                : '/image-proxy?url=' + encodeURIComponent(detail.url);
            fetch(fetchUrl)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Image fetch failed: ' + response.status);
                    }
                    return response.blob();
                })
                .then(function(blob) {
                    objectUrl = URL.createObjectURL(blob);
                    showModal(objectUrl);
                })
                .catch(function(err) {
                    console.warn('[PhotoPreview] Could not load image for crop editor:', err);
                });
        }
    }

    // ── public API ──────────────────────────────────────────────────

    function init() {
        if (typeof Cropper === 'undefined') {
            return;
        }
        if (typeof bootstrap === 'undefined') {
            return;
        }
        if (!document.getElementById('cropModal')) {
            buildModal();
        }
        document.addEventListener('multi-image:edit', onEditRequested);
    }

    window.PhotoPreview = { init: init };

    document.addEventListener('DOMContentLoaded', function() {
        window.PhotoPreview.init();
    });
})();
