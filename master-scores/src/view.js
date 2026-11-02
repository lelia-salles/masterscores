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

const renderScore = async (container, score) => {
	if (!container || !score?.tracks?.length) return;

	const track = score.tracks[0];
	const measure = track?.measures?.[0];
	const voiceData = measure?.voices?.[0];
	if (!measure || !voiceData) return;

	await VexFlow.loadFonts('Bravura', 'Academico');

	const width = Math.max(container.clientWidth || 600, 280);
	const height = 220;

	container.innerHTML = '';

	const renderer = new Renderer(container, Renderer.Backends.SVG);
	renderer.resize(width, height);

	const context = renderer.getContext();
	const stave = new Stave(10, 40, Math.max(width - 20, 200));
	stave
		.addClef(measure.clef || 'treble')
		.addTimeSignature(measure.timeSignature || '4/4');
	stave.setContext(context).draw();

	if (!voiceData.notes || voiceData.notes.length === 0) return;

	const vexNotes = voiceData.notes.map((note) => {
		const isRest = note.isRest || !note.keys || note.keys.length === 0;
		const mappedKeys = isRest
			? ['b/4']
			: note.keys.map((key) =>
				key.trim().toLowerCase().replace(/^([a-g])(#|b)?(\d)$/, '$1$2/$3')
			);

		const staveNote = new StaveNote({
			clef: measure.clef || 'treble',
			keys: mappedKeys,
			duration: isRest ? `${note.duration || 'q'}r` : note.duration || 'q',
		});

		if (!isRest) {
			note.keys.forEach((key, idx) => {
				const match = key.trim().match(/^[a-gA-G](#|b)\d$/);
				if (match && match[1]) {
					staveNote.addModifier(new Accidental(match[1]), idx);
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

	new Formatter()
		.joinVoices([voice])
		.format([voice], Math.max(width - 90, 150));
	voice.draw(context, stave);
};

const attachPlayButton = (container, score) => {
	const wrapper = container.parentElement;
	if (!wrapper || !wrapper.querySelector) return;

	// Avoid duplicate buttons if the block is hydrated twice
	if (wrapper.querySelector('.master-scores-play')) return;

	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'master-scores-play';
	btn.setAttribute('aria-label', 'Tocar partitura');
	btn.textContent = '▶ Tocar';
	wrapper.appendChild(btn);

	let playing = false;
	let synth = null;

	const stop = () => {
		Tone.Transport.stop();
		Tone.Transport.cancel(0);
		playing = false;
		btn.textContent = '▶ Tocar';
	};

	btn.addEventListener('click', async () => {
		if (playing) {
			stop();
			return;
		}

		await Tone.start();
		if (!synth) {
			synth = new Tone.PolySynth(Tone.Synth).toDestination();
		}

		Tone.Transport.stop();
		Tone.Transport.cancel(0);
		Tone.Transport.bpm.value = score.playback?.bpm || 120;

		if (score.playback?.swing) {
			Tone.Transport.swing = 0.5;
			Tone.Transport.swingSubdivision = '8n';
		} else {
			Tone.Transport.swing = 0;
		}

		let t = 0;
		const voice = score.tracks?.[0]?.measures?.[0]?.voices?.[0];
		if (voice?.notes?.length) {
			voice.notes.forEach((note) => {
				const toneDuration = mapDurationToTone(
					note.duration,
					note.dots || 0
				);

				if (!note.isRest && note.keys.length > 0) {
					const cleanKeys = note.keys.map((k) => {
						const m = k.trim().match(/^([a-gA-G])(#|b)?(\d)$/);
						return m
							? `${m[1].toUpperCase()}${m[2] || ''}${m[3]}`
							: 'C4';
					});
					Tone.Transport.schedule((time) => {
						synth?.triggerAttackRelease(cleanKeys, toneDuration, time);
					}, t);
				}

				t += Tone.Time(toneDuration).toSeconds();
			});
		}

		Tone.Transport.schedule((time) => {
			Tone.Draw.schedule(() => {
				playing = false;
				btn.textContent = '▶ Tocar';
				Tone.Transport.stop();
			}, time);
		}, t);

		Tone.Transport.start();
		playing = true;
		btn.textContent = '⏹ Parar';
	});
};

const init = async () => {
	const containers = document.querySelectorAll(
		'.master-scores-canvas[data-score]'
	);

	for (const container of Array.from(containers)) {
		const raw = container.getAttribute('data-score');
		if (!raw) continue;

		let score;
		try {
			score = JSON.parse(raw);
		} catch (e) {
			console.error('Master Scores: invalid data-score JSON', e);
			continue;
		}

		try {
			await renderScore(container, score);
			attachPlayButton(container, score);
		} catch (e) {
			console.error('Master Scores: failed to render', e);
		}
	}
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

// Re-render on resize (basic)
let resizeTimer;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(init, 150);
});