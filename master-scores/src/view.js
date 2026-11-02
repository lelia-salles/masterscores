import {
	Renderer,
	Stave,
	StaveNote,
	Formatter,
	Voice,
	Accidental,
	Dot,
	VexFlow,
} from 'vexflow';
import * as Tone from 'tone';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

// Must match the constants in edit.tsx so editor preview and frontend agree.
const MEASURE_WIDTH = 240;
const LINE_HEIGHT = 150;
const LEFT_MARGIN = 10;
const TOP_MARGIN = 20;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const mapDurationToTone = (duration, dots = 0) => {
	const base = {
		w: '1n',
		h: '2n',
		q: '4n',
		'8': '8n',
		'16': '16n',
		'32': '32n',
	};
	const baseName = base[duration] || '4n';
	if (dots === 1) return `${baseName}.`;
	if (dots === 2) return `${baseName}..`;
	return baseName;
};

const durationToBeats = (duration, dots = 0) => {
	const base = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };
	let beats = base[duration] || 1;
	if (dots === 1) beats *= 1.5;
	if (dots === 2) beats *= 1.75;
	return beats;
};

/* -------------------------------------------------------------------------- */
/* Fonts                                                                      */
/* -------------------------------------------------------------------------- */

let fontsPromise = null;

const ensureFonts = () => {
	if (!fontsPromise) {
		fontsPromise = (async () => {
			try {
				await VexFlow.loadFonts('Bravura', 'Academico');
			} catch (e) {
				console.warn(
					'Master Scores: font load failed — using fallback.',
					e
				);
			}
		})();
	}
	return fontsPromise;
};

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Renders every measure of the first track, wrapping to new lines when the
 * container width is exhausted. Clef + key signature repeat at the start of
 * each line; the time signature only appears on the very first measure.
 */
const renderScore = async (container, score) => {
	if (!container || !score?.tracks?.length) return false;

	const measures = score.tracks[0]?.measures;
	if (!measures?.length) return false;

	await ensureFonts();

	const width = Math.max(container.clientWidth || 600, 280);
	const usableWidth = Math.max(width - LEFT_MARGIN * 2, MEASURE_WIDTH);
	const perLine = Math.max(1, Math.floor(usableWidth / MEASURE_WIDTH));
	const lines = Math.ceil(measures.length / perLine);
	const totalHeight = TOP_MARGIN + lines * LINE_HEIGHT + 40;

	container.innerHTML = '';

	const renderer = new Renderer(container, Renderer.Backends.SVG);
	renderer.resize(width, totalHeight);
	const context = renderer.getContext();

	measures.forEach((measure, index) => {
		const line = Math.floor(index / perLine);
		const col = index % perLine;
		const x = LEFT_MARGIN + col * MEASURE_WIDTH;
		const y = TOP_MARGIN + line * LINE_HEIGHT;

		const stave = new Stave(x, y, MEASURE_WIDTH);

		if (col === 0) {
			stave.addClef(measure.clef || 'treble');
			if (measure.keySignature && measure.keySignature !== 'C') {
				stave.addKeySignature(measure.keySignature);
			}
		}
		if (index === 0) {
			stave.addTimeSignature(measure.timeSignature || '4/4');
		}
		stave.setContext(context).draw();

		const voiceData = measure?.voices?.[0];
		if (!voiceData?.notes?.length) return;

		try {
			const vexNotes = voiceData.notes.map((note) => {
				const isRest =
					note.isRest || !note.keys || note.keys.length === 0;

				const mappedKeys = isRest
					? ['b/4']
					: note.keys.map((key) => {
						const clean = key.trim().toLowerCase();
						return clean.replace(
							/^([a-g])(#|b)?(\d)$/,
							'$1$2/$3'
						);
					});

				const staveNote = new StaveNote({
					clef: measure.clef || 'treble',
					keys: mappedKeys,
					duration: isRest
						? `${note.duration || 'q'}r`
						: note.duration || 'q',
				});

				if (!isRest) {
					note.keys.forEach((key, idx) => {
						const m = key.trim().match(/^[a-gA-G](#|b)\d$/);
						if (m && m[1]) {
							staveNote.addModifier(new Accidental(m[1]), idx);
						}
					});
				}

				const dots = Math.min(note.dots || 0, 2);
				for (let i = 0; i < dots; i++) {
					Dot.buildAndAttach([staveNote], { all: true });
				}

				return staveNote;
			});

			const [numBeats, beatValue] = (measure.timeSignature || '4/4')
				.split('/')
				.map(Number);

			const voice = new Voice({
				numBeats: numBeats || 4,
				beatValue: beatValue || 4,
			});
			voice.setStrict(false);
			voice.addTickables(vexNotes);

			const noteWidth = Math.max(
				80,
				stave.getNoteEndX() - stave.getNoteStartX() - 10
			);
			new Formatter().joinVoices([voice]).format([voice], noteWidth);
			voice.draw(context, stave);
		} catch (error) {
			console.error(
				`Master Scores: VexFlow render error (compasso ${index})`,
				error
			);
		}
	});

	return true;
};

/* -------------------------------------------------------------------------- */
/* Playback                                                                   */
/* -------------------------------------------------------------------------- */

let activeSession = null;

const stopActiveSession = () => {
	if (activeSession) {
		try {
			activeSession.stop();
		} catch (_) {
			/* noop */
		}
		activeSession = null;
	}
};

/**
 * Play the first voice of the first measure of the first track.
 * (Multi-measure playback lands in Feature #3.)
 */
const playScore = async (score, onEnded) => {
	await Tone.start();

	const synth = new Tone.PolySynth(Tone.Synth, {
		oscillator: { type: 'triangle' },
		envelope: {
			attack: 0.02,
			decay: 0.1,
			sustain: 0.3,
			release: 0.4,
		},
	}).toDestination();
	synth.volume.value = -8;

	const transport = Tone.getTransport();
	transport.stop();
	transport.cancel(0);
	transport.bpm.value = score.playback?.bpm || 120;

	if (score.playback?.swing) {
		transport.swing = 0.5;
		transport.swingSubdivision = '8n';
	} else {
		transport.swing = 0;
	}

	const voice = score.tracks?.[0]?.measures?.[0]?.voices?.[0];
	if (!voice?.notes?.length) {
		synth.dispose();
		return null;
	}

	const bpm = score.playback?.bpm || 120;
	const secondsPerBeat = 60 / bpm;

	let secondsAccumulated = 0;

	voice.notes.forEach((note) => {
		const toneDuration = mapDurationToTone(
			note.duration,
			note.dots || 0
		);

		if (!note.isRest && note.keys && note.keys.length > 0) {
			const cleanKeys = note.keys.map((k) => {
				const m = k.trim().match(/^([a-gA-G])(#|b)?(\d)$/);
				return m
					? `${m[1].toUpperCase()}${m[2] || ''}${m[3]}`
					: 'C4';
			});

			transport.schedule((time) => {
				synth.triggerAttackRelease(cleanKeys, toneDuration, time);
			}, secondsAccumulated);
		}

		secondsAccumulated +=
			durationToBeats(note.duration, note.dots || 0) *
			secondsPerBeat;
	});

	transport.schedule((time) => {
		Tone.Draw.schedule(() => {
			try {
				onEnded && onEnded();
			} catch (_) {
				/* noop */
			}
			try {
				transport.stop();
				transport.cancel(0);
			} catch (_) {
				/* noop */
			}
			try {
				synth.dispose();
			} catch (_) {
				/* noop */
			}
		}, time);
	}, secondsAccumulated);

	transport.start();

	return {
		stop() {
			try {
				transport.stop();
				transport.cancel(0);
			} catch (_) {
				/* noop */
			}
			try {
				synth.dispose();
			} catch (_) {
				/* noop */
			}
			if (onEnded) onEnded();
		},
	};
};

/* -------------------------------------------------------------------------- */
/* Play button                                                                */
/* -------------------------------------------------------------------------- */

const attachPlayButton = (canvas, score) => {
	const wrapper = canvas.parentElement;
	if (!wrapper) return;

	if (wrapper.querySelector('.master-scores-play')) return;

	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'master-scores-play';

	const setLabel = (playing) => {
		btn.classList.toggle('is-playing', playing);
		btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
		btn.setAttribute(
			'aria-label',
			playing ? 'Parar reprodução' : 'Tocar partitura'
		);
		btn.innerHTML = playing
			? '<span class="master-scores-play-icon" aria-hidden="true">⏹</span><span>Parar</span>'
			: '<span class="master-scores-play-icon" aria-hidden="true">▶</span><span>Tocar</span>';
	};

	setLabel(false);
	wrapper.appendChild(btn);

	let session = null;

	btn.addEventListener('click', async () => {
		if (session) {
			try {
				session.stop();
			} catch (_) {
				/* noop */
			}
			return;
		}

		stopActiveSession();

		try {
			const newSession = await playScore(score, () => {
				if (session === newSession) {
					session = null;
					activeSession = null;
					setLabel(false);
				}
			});

			if (newSession) {
				session = newSession;
				activeSession = newSession;
				setLabel(true);
			}
		} catch (err) {
			console.error('Master Scores: playback error', err);
			session = null;
			activeSession = null;
			setLabel(false);
		}
	});
};

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

const init = async () => {
	const canvases = document.querySelectorAll(
		'.master-scores-canvas[data-score]'
	);

	for (const canvas of Array.from(canvases)) {
		const raw = canvas.getAttribute('data-score');
		if (!raw) continue;

		let score;
		try {
			score = JSON.parse(raw);
		} catch (e) {
			console.error('Master Scores: invalid data-score JSON', e);
			continue;
		}

		try {
			const ok = await renderScore(canvas, score);
			if (ok) attachPlayButton(canvas, score);
		} catch (e) {
			console.error('Master Scores: failed to render block', e);
		}
	}
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

/* Debounced resize re-render — recomputes line wrapping. */
let resizeTimer;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(() => {
		document
			.querySelectorAll('.master-scores-canvas[data-score]')
			.forEach(async (canvas) => {
				const raw = canvas.getAttribute('data-score');
				if (!raw) return;
				try {
					const score = JSON.parse(raw);
					await renderScore(canvas, score);
				} catch (_) {
					/* noop */
				}
			});
	}, 150);
});