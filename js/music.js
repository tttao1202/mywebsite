document.addEventListener('DOMContentLoaded', () => {
	const scriptEl = document.currentScript || document.querySelector('script[src*="music.js"]');
	const audioSrc = (() => {
		if (scriptEl && scriptEl.src) {
			return scriptEl.src.replace(/\/js\/[^\/?#]+(?:[?#].*)?$/, '/sound/いのちの名前.m4a');
		}
		return './sound/いのちの名前.m4a';
	})();

	// 本地存储 key 定义
	const LS_KEYS = {
		consent: 'musicConsent', // 'granted' | 'denied'
		volume: 'musicVolume',   // 0-100
		wasPlaying: 'musicWasPlaying', // '1' | '0'
		currentTime: 'musicCurrentTime' // seconds (number)
	};

	// 仅在首页显示弹窗：支持 index.html 或根路径
	const path = (location && location.pathname) || '';
	const isHome = /\/(index\.html)?$/.test(path);
	const storedConsent = sessionStorage.getItem(LS_KEYS.consent);
	const shouldShowModal = isHome && storedConsent == null;

	const audio = new Audio(audioSrc);
	audio.preload = 'auto';
	audio.loop = true;
	// 初始化音量：优先使用已保存值；默认 50%
	const savedVolume = Number(sessionStorage.getItem(LS_KEYS.volume));
	audio.volume = isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 100 ? Math.min(Math.max(savedVolume, 0), 100) / 100 : 0.5;

	// 若已保存为 0，则在首次播放前提升到 50%
	const ensureMinimumVolumeBeforePlay = () => {
		const volStr = sessionStorage.getItem(LS_KEYS.volume);
		const volNum = Number(volStr);
		if (!isFinite(volNum) || volNum <= 0) {
			const newVol = 50;
			audio.volume = newVol / 100;
			try { sessionStorage.setItem(LS_KEYS.volume, String(newVol)); } catch {}
			if (volumeSlider) {
				volumeSlider.value = String(newVol);
			}
		}
	};

	let userInteracted = false;

	const backdrop = document.createElement('div');
	backdrop.className = 'music-modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'music-modal';
	modal.innerHTML = `
		<h2>欢迎来到千与千寻专题站</h2>
		<p>是否播放背景音乐《いのちの名前》？</p>
		<div class="music-modal-actions">
			<button type="button" class="music-btn music-btn-primary" data-action="play">播放</button>
			<button type="button" class="music-btn" data-action="deny">不播放</button>
		</div>
	`;

	const closeModal = () => {
		backdrop.remove();
		modal.remove();
	};

	const mountModal = () => {
		document.body.appendChild(backdrop);
		document.body.appendChild(modal);
		const playBtn = modal.querySelector('[data-action="play"]');
		const denyBtn = modal.querySelector('[data-action="deny"]');

		playBtn?.addEventListener('click', () => {
			userInteracted = true;
			ensureMinimumVolumeBeforePlay();
			updateVolumeFromSlider();
			audio.play().catch(() => {
				// 如果播放失败（如浏览器限制），保持暂停状态
				toggleBtn.textContent = '播放';
			});
			toggleBtn.textContent = '暂停';
			sessionStorage.setItem(LS_KEYS.consent, 'granted');
			closeModal();
		});

		denyBtn?.addEventListener('click', () => {
			userInteracted = true;
			toggleBtn.textContent = '播放';
			sessionStorage.setItem(LS_KEYS.consent, 'denied');
			closeModal();
		});
	};

	const controls = document.createElement('div');
	controls.className = 'music-controls';
	controls.innerHTML = `
		<button type="button" class="music-toggle">暂停</button>
		<label class="music-volume-label">
			音量
			<input type="range" min="0" max="100" value="50" class="music-volume" aria-label="背景音乐音量">
		</label>
	`;

	const toggleBtn = controls.querySelector('.music-toggle');
	const volumeSlider = controls.querySelector('.music-volume');
	if (volumeSlider) {
		const initVol = Math.round(audio.volume * 100);
		if (!Number.isNaN(initVol)) volumeSlider.value = String(initVol);
	}

	const updateVolumeFromSlider = () => {
		if (!volumeSlider) return;
		const value = Number(volumeSlider.value || 0);
		const clamped = Math.min(Math.max(value, 0), 100);
		audio.volume = clamped / 100;
		try { sessionStorage.setItem(LS_KEYS.volume, String(clamped)); } catch {}
	};

	volumeSlider?.addEventListener('input', () => {
		updateVolumeFromSlider();
	});

	const updateToggleLabel = () => {
		if (!toggleBtn) return;
		toggleBtn.textContent = audio.paused ? '播放' : '暂停';
	};

	toggleBtn?.addEventListener('click', () => {
		if (!userInteracted) {
			userInteracted = true;
		}
		if (audio.paused) {
			ensureMinimumVolumeBeforePlay();
			updateVolumeFromSlider();
		audio.play().catch(() => {
				// 播放失败时保持暂停
			});
		} else {
			audio.pause();
		}
		updateToggleLabel();
	});

	audio.addEventListener('pause', updateToggleLabel);
	audio.addEventListener('play', updateToggleLabel);

	// 页面卸载前保存播放状态与进度
	const persistPlaybackState = () => {
		try {
			sessionStorage.setItem(LS_KEYS.wasPlaying, audio.paused ? '0' : '1');
			sessionStorage.setItem(LS_KEYS.currentTime, String(Math.floor(audio.currentTime || 0)));
		} catch {}
	};
	window.addEventListener('beforeunload', persistPlaybackState);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') persistPlaybackState();
	});

	document.body.appendChild(controls);

	// 初始状态：
	// 1) 首次访问首页且未记录同意/拒绝 -> 弹窗
	// 2) 如已同意，尽量恢复上次播放状态与进度
	updateToggleLabel();
	if (shouldShowModal) {
		mountModal();
	}

	// 自动恢复播放（在用户已同意的情况下）
	if (storedConsent === 'granted') {
		const wasPlaying = sessionStorage.getItem(LS_KEYS.wasPlaying) === '1';
		const resumeAt = Number(sessionStorage.getItem(LS_KEYS.currentTime));
		if (isFinite(resumeAt) && resumeAt > 0) {
			try { audio.currentTime = resumeAt; } catch {}
		}
		if (wasPlaying) {
			// 由于用户此前已交互，大多浏览器允许后续自动播放
			ensureMinimumVolumeBeforePlay();
			audio.play().catch(() => {
				// 若仍被阻止，用户可点击控制按钮恢复
			});
		}
	}
});

