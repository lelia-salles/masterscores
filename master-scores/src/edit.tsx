import { useEffect, useRef, useState } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import {
	PanelBody,
	TextControl,
	RangeControl,
	ToggleControl,
	TextareaControl,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { Play, Square, Save, Music } from 'lucide-react';
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

import { initialScoreMock } from './mockScore';
import { ScoreState, ScoreNote } from './types/scores';

const VALID_DURATIONS = ['w', 'h', 'q', '8', '16', '32'] as const;

const cloneScore = (score: ScoreState): ScoreState =>
	JSON.parse(JSON.stringify(score));

/**
 * Maps a VexFlow duration to a Tone.js duration string,
 * including dotted variants (Tone uses `"4n."` for a dotted quarter, `"4n.."` for double-dotted).
 */
const mapDurationToTone = (duration: string, dots = 0): string => {
	const base: Record<string, string> = {
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

/**
 * Normaliza uma tecla para o formato `Letter[#|b]Octave` (ex.: `C4`, `Bb4`, `F#3`).
 * Aceita oitavas 0–8 (piano range completo).
 * Retorna `null` se a tecla não for válida.
 */
const normalizeKey = (raw: string): string | null => {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const formatted =
		trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
	if (! /^[A-G](#|b)?[0-8]$/.test(formatted)) {
		return null;
	}
	return formatted;
};

// Garante que a fonte Bravura está carregada tanto na janela principal como no iframe do editor
const ensureFontsInDocument = async (el: HTMLElement | null) => {
	await VexFlow.loadFonts('Bravura', 'Academico');
	const ownerDoc = el?.ownerDocument;
	if (ownerDoc && ownerDoc !== document && 'fonts' in ownerDoc) {
		document.fonts.forEach((fontFace) => {
			if (
				fontFace.family.includes('Bravura') ||
				fontFace.family.includes('Academico')
			) {
				ownerDoc.fonts.add(fontFace);
			}
		});
	}
};

const renderScoreToElement = async (
	container: HTMLDivElement | null,
	width: number,
	height: number,
	score: ScoreState | undefined
) => {
	if (!container || !score?.tracks?.length) return;

	const track = score.tracks[0];
	const measure = track?.measures?.[0];
	const voiceData = measure?.voices?.[0];
	if (!measure || !voiceData) return;

	await ensureFontsInDocument(container);

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

	try {
		const vexNotes = voiceData.notes.map((note) => {
			const isRest = note.isRest || !note.keys || note.keys.length === 0;
			const mappedKeys = isRest
				? ['b/4']
				: note.keys.map((key) => {
					const cleanKey = key.trim().toLowerCase();
					return cleanKey.replace(/^([a-g])(#|b)?(\d)$/, '$1$2/$3');
				});

			const staveNote = new StaveNote({
				clef: measure.clef || 'treble',
				keys: mappedKeys,
				duration: isRest
					? `${note.duration || 'q'}r`
					: note.duration || 'q',
			});

			// Accidentals (only for non-rests)
			if (!isRest) {
				note.keys.forEach((key, idx) => {
					const match = key.trim().match(/^[a-gA-G](#|b)\d$/);
					if (match && match[1]) {
						staveNote.addModifier(new Accidental(match[1]), idx);
					}
				});
			}

			// Dots — apply one modifier per dot (buildAndAttach handles chord "all" heads)
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
	} catch (error) {
		console.error('Erro ao renderizar a pauta VexFlow:', error);
	}
};

/**
 * Lossless serialization: every note/rest carries its duration so the textarea round-trip
 * does not silently convert durations to quarter notes.
 */
const formatNotesToString = (notes: ScoreNote[] = []) =>
	notes
		.map((n) => {
			const dur = n.duration || 'q';
			if (n.isRest) return `REST/${dur}`;
			return n.keys.map((k) => `${k}/${dur}`).join(' ');
		})
		.join(', ');

export default function Edit({ attributes, setAttributes }) {
	const blockProps = useBlockProps({
		className: 'wp-block-create-block-master-scores',
	});

	const score: ScoreState = attributes.score ?? initialScoreMock;

	const scoreContainerRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const [isPlaying, setIsPlaying] = useState(false);
	const [canvasWidth, setCanvasWidth] = useState(600);
	const [notesInput, setNotesInput] = useState(() =>
		formatNotesToString(
			score.tracks?.[0]?.measures?.[0]?.voices?.[0]?.notes
		)
	);

	const synthRef = useRef<Tone.PolySynth | null>(null);

	useEffect(() => {
		if (!panelRef.current) return;
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setCanvasWidth(Math.floor(entry.contentRect.width));
			}
		});
		resizeObserver.observe(panelRef.current);
		return () => resizeObserver.disconnect();
	}, []);

	useEffect(() => {
		const safeWidth = Math.max(canvasWidth, 280);
		renderScoreToElement(scoreContainerRef.current, safeWidth, 220, score);
	}, [score, canvasWidth]);

	useEffect(() => {
		return () => {
			if (synthRef.current) synthRef.current.dispose();
			Tone.Transport.stop();
			Tone.Transport.cancel(0);
		};
	}, []);

	const updateScore = (newScore: ScoreState) => {
		setAttributes({ score: newScore });
	};

	const handleNotesChange = (val: string) => {
		setNotesInput(val);

		const rawTokens = val
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		const validNotes: ScoreNote[] = [];

		rawTokens.forEach((token, index) => {
			// REST (with optional duration, e.g. REST/w, REST/h)
			if (token.toUpperCase().startsWith('REST')) {
				let dur = 'q';
				const [, rawDur] = token.split('/');
				if (rawDur) {
					const d = rawDur.trim().toLowerCase();
					if ((VALID_DURATIONS as readonly string[]).includes(d)) {
						dur = d;
					}
				}
				validNotes.push({
					id: `note-${index}`,
					keys: [],
					duration: dur,
					isRest: true,
					dots: 0,
				});
				return;
			}

			const subTokens = token.split(/\s+/);
			let currentDuration = 'q';
			const noteKeys: string[] = [];

			subTokens.forEach((sub) => {
				const hasDuration = sub.includes('/');
				const [rawKey, rawDur] = hasDuration
					? sub.split('/')
					: [sub, undefined];

				const key = normalizeKey(rawKey);
				if (key) noteKeys.push(key);

				if (hasDuration && rawDur) {
					const cleanDur = rawDur.trim().toLowerCase();
					if ((VALID_DURATIONS as readonly string[]).includes(cleanDur)) {
						currentDuration = cleanDur;
					}
				}
			});

			if (noteKeys.length > 0) {
				validNotes.push({
					id: `note-${index}`,
					keys: noteKeys,
					duration: currentDuration,
					isRest: false,
					dots: 0,
				});
			}
		});

		if (validNotes.length > 0) {
			const newScore = cloneScore(score);
			if (newScore.tracks?.[0]?.measures?.[0]?.voices?.[0]) {
				newScore.tracks[0].measures[0].voices[0].notes = validNotes;
				updateScore(newScore);
			}
		}
	};

	const togglePlayback = async () => {
		if (isPlaying) {
			Tone.Transport.stop();
			Tone.Transport.cancel(0);
			setIsPlaying(false);
			return;
		}

		await Tone.start();

		if (!synthRef.current) {
			synthRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
		}

		Tone.Transport.stop();
		Tone.Transport.cancel(0);
		Tone.Transport.bpm.value = score.playback.bpm || 120;

		// Swing is applied to 8th-note pairs. 0 = off, 0.5 ≈ heavy swing.
		if (score.playback.swing) {
			Tone.Transport.swing = 0.5;
			Tone.Transport.swingSubdivision = '8n';
		} else {
			Tone.Transport.swing = 0;
		}

		let currentTime = 0;
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
						synthRef.current?.triggerAttackRelease(
							cleanKeys,
							toneDuration,
							time
						);
					}, currentTime);
				}

				currentTime += Tone.Time(toneDuration).toSeconds();
			});
		}

		Tone.Transport.schedule((time) => {
			Tone.Draw.schedule(() => {
				setIsPlaying(false);
				Tone.Transport.stop();
			}, time);
		}, currentTime);

		Tone.Transport.start();
		setIsPlaying(true);
	};

	return (
		<div {...blockProps}>
			<InspectorControls>
				<PanelBody title={__('Metadados da Partitura', 'master-scores')}>
					<TextControl
						label={__('Título', 'master-scores')}
						value={score.metadata.title}
						onChange={(val) => {
							const newScore = cloneScore(score);
							newScore.metadata.title = val;
							updateScore(newScore);
						}}
					/>
					<TextControl
						label={__('Compositor', 'master-scores')}
						value={score.metadata.composer}
						onChange={(val) => {
							const newScore = cloneScore(score);
							newScore.metadata.composer = val;
							updateScore(newScore);
						}}
					/>
				</PanelBody>

				<PanelBody title={__('Reprodução de Áudio', 'master-scores')}>
					<RangeControl
						label={__('BPM (Tempo)', 'master-scores')}
						value={score.playback.bpm}
						onChange={(val) => {
							const newScore = cloneScore(score);
							newScore.playback.bpm = val ?? 120;
							updateScore(newScore);
						}}
						min={40}
						max={240}
					/>
					<ToggleControl
						label={__('Aplicar Swing', 'master-scores')}
						checked={score.playback.swing}
						onChange={(val) => {
							const newScore = cloneScore(score);
							newScore.playback.swing = val;
							updateScore(newScore);
						}}
					/>
				</PanelBody>

				<PanelBody title={__('Editor de Notas', 'master-scores')}>
					<TextareaControl
						label={__(
							'Sequência Musical (separada por vírgula)',
							'master-scores'
						)}
						value={notesInput}
						onChange={handleNotesChange}
						help={__(
							'Exemplo: C4/w, D4/h, E4/q, REST/q, C4/8 E4/16 G4/32 (notas de um acorde separadas por espaço; duração após "/")',
							'master-scores'
						)}
					/>
				</PanelBody>
			</InspectorControls>

			<div className="master-scores-editor">
				<div className="master-scores-toolbar">
					<div className="master-scores-brand">
						<div className="master-scores-brand-icon">
							<Music size={18} />
						</div>
						<div>
							<strong>{score.metadata.title}</strong>
						</div>
					</div>

					<div className="master-scores-actions">
						<button
							type="button"
							className={`master-scores-button ${isPlaying ? '' : 'master-scores-button-primary'
								}`}
							onClick={togglePlayback}
						>
							{isPlaying ? <Square size={16} /> : <Play size={16} />}
							{isPlaying
								? __('Parar', 'master-scores')
								: __('Tocar', 'master-scores')}
						</button>

						<button
							type="button"
							className="master-scores-button"
							onClick={() => updateScore(cloneScore(score))}
						>
							<Save size={16} />
							{__('Forçar Gravação', 'master-scores')}
						</button>
					</div>
				</div>

				<div className="master-scores-score-panel" ref={panelRef}>
					<div className="master-scores-header">
						<h2>{score.metadata.title}</h2>
						<p>{score.metadata.composer}</p>
					</div>

					<div
						ref={scoreContainerRef}
						className="master-scores-canvas"
					/>
				</div>
			</div>
		</div>
	);
}