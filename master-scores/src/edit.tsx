import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import type { BlockEditProps } from '@wordpress/blocks';
import {
	PanelBody,
	TextControl,
	RangeControl,
	ToggleControl,
	TextareaControl,
	Button,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { Play, Square, Save, Music, Plus, Trash } from 'lucide-react';
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
import { ScoreState, ScoreNote, BlockAttributes } from './types/scores';
import { transposeKey, setKeyAccidental } from './utils/pitch';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const VALID_DURATIONS = ['w', 'h', 'q', '8', '16', '32'] as const;
const DURATION_OPTIONS = ['w', 'h', 'q', '8', '16', '32'] as const;

const MEASURE_WIDTH = 240;
const LINE_HEIGHT = 150;
const LEFT_MARGIN = 10;
const TOP_MARGIN = 20;

type RenderHandle = {
	setActiveMeasure: (index: number | null) => void;
	setSelectedNote: (
		measureIndex: number | null,
		noteIndex: number | null
	) => void;
};

type Selection = {
	measureIndex: number;
	noteIndex: number;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const cloneScore = (score: ScoreState): ScoreState =>
	JSON.parse(JSON.stringify(score));

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

const normalizeKey = (raw: string): string | null => {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const formatted =
		trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
	if (! /^[A-G](#|b)?[0-8]$/.test(formatted)) return null;
	return formatted;
};

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

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

const renderScoreToElement = async (
	container: HTMLDivElement | null,
	width: number,
	score: ScoreState | undefined,
	onNoteClick?: (
		measureIndex: number | null,
		noteIndex: number | null
	) => void
): Promise<RenderHandle | null> => {
	if (!container || !score?.tracks?.length) return null;

	const measures = score.tracks[0]?.measures;
	if (!measures?.length) return null;

	await ensureFontsInDocument(container);
	container.innerHTML = '';

	const usableWidth = Math.max(width - LEFT_MARGIN * 2, MEASURE_WIDTH);
	const perLine = Math.max(1, Math.floor(usableWidth / MEASURE_WIDTH));
	const lines = Math.ceil(measures.length / perLine);
	const totalHeight = TOP_MARGIN + lines * LINE_HEIGHT + 40;

	const renderer = new Renderer(container, Renderer.Backends.SVG);
	renderer.resize(width, totalHeight);
	const context = renderer.getContext();

	const svg = container.querySelector('svg');
	if (!svg) return null;

	const highlightRects: SVGRectElement[] = [];

	measures.forEach((measure, index) => {
		const line = Math.floor(index / perLine);
		const col = index % perLine;
		const x = LEFT_MARGIN + col * MEASURE_WIDTH;
		const y = TOP_MARGIN + line * LINE_HEIGHT;

		const rect = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'rect'
		);
		rect.setAttribute('class', 'master-scores-measure-highlight');
		rect.setAttribute('x', String(x));
		rect.setAttribute('y', String(y - 20));
		rect.setAttribute('width', String(MEASURE_WIDTH));
		rect.setAttribute('height', '100');
		rect.setAttribute('data-measure-index', String(index));
		svg.insertBefore(rect, svg.firstChild);
		highlightRects.push(rect);

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

		const groupsBefore =
			svg.querySelectorAll('g.vf-stavenote').length;

		try {
			const vexNotes = voiceData.notes.map((note) => {
				const isRest =
					note.isRest || !note.keys || note.keys.length === 0;
				const mappedKeys = isRest
					? ['b/4']
					: note.keys.map((key) => {
						const cleanKey = key.trim().toLowerCase();
						return cleanKey.replace(
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
						const match = key.trim().match(/^[a-gA-G](#|b)\d$/);
						if (match && match[1]) {
							staveNote.addModifier(
								new Accidental(match[1]),
								idx
							);
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

			// Tag this measure's newly drawn note groups so clicks can be
			// mapped back to { measureIndex, noteIndex }.
			const allGroups = Array.from(
				svg.querySelectorAll('g.vf-stavenote')
			);
			const newGroups = allGroups.slice(groupsBefore);

			newGroups.forEach((g, noteIdx) => {
				g.classList.add('master-scores-note');
				g.setAttribute('data-measure-index', String(index));
				g.setAttribute('data-note-index', String(noteIdx));
				g.addEventListener('click', (e) => {
					e.stopPropagation();
					onNoteClick?.(index, noteIdx);
				});
			});
		} catch (error) {
			console.error(`Erro ao renderizar compasso ${index}:`, error);
		}
	});

	// Clicking empty staff area deselects.
	svg.addEventListener('click', (e) => {
		const target = e.target as Element;
		if (!target.closest('g.vf-stavenote')) {
			onNoteClick?.(null, null);
		}
	});

	return {
		setActiveMeasure(activeIndex) {
			highlightRects.forEach((rect, i) => {
				if (i === activeIndex) {
					rect.classList.add('is-active');
				} else {
					rect.classList.remove('is-active');
				}
			});
		},
		setSelectedNote(measureIndex, noteIndex) {
			svg.querySelectorAll('g.vf-stavenote.master-scores-selected').forEach(
				(el) => el.classList.remove('master-scores-selected')
			);
			if (measureIndex === null || noteIndex === null) return;
			const el = svg.querySelector(
				`g.vf-stavenote[data-measure-index="${measureIndex}"][data-note-index="${noteIndex}"]`
			);
			el?.classList.add('master-scores-selected');
		},
	};
};

/* -------------------------------------------------------------------------- */
/* Note <-> string                                                           */
/* -------------------------------------------------------------------------- */

const formatNotesToString = (notes: ScoreNote[] = []) =>
	notes
		.map((n) => {
			const dur = n.duration || 'q';
			if (n.isRest) return `REST/${dur}`;
			return n.keys.map((k) => `${k}/${dur}`).join(' ');
		})
		.join(', ');

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function Edit({
	attributes,
	setAttributes,
}: BlockEditProps<BlockAttributes>) {
	const blockProps = useBlockProps({
		className: 'wp-block-create-block-master-scores',
	});

	const score: ScoreState = attributes.score ?? initialScoreMock;
	const measures = score.tracks?.[0]?.measures ?? [];

	const scoreContainerRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const [isPlaying, setIsPlaying] = useState(false);
	const [canvasWidth, setCanvasWidth] = useState(600);
	const [currentMeasureIndex, setCurrentMeasureIndex] = useState(0);
	const [selection, setSelection] = useState<Selection | null>(null);

	const safeMeasureIndex = Math.min(
		currentMeasureIndex,
		Math.max(0, measures.length - 1)
	);

	const [notesInput, setNotesInput] = useState(() =>
		formatNotesToString(measures[0]?.voices?.[0]?.notes)
	);

	const synthRef = useRef<Tone.PolySynth | null>(null);
	const renderHandleRef = useRef<RenderHandle | null>(null);
	const activeMeasureRef = useRef<number | null>(null);

	/* -------- Derived selected note -------- */

	const selectedNote =
		selection != null
			? measures[selection.measureIndex]?.voices?.[0]?.notes?.[
			selection.noteIndex
			] ?? null
			: null;

	/* -------- Stable click callback (selection toggle) -------- */

	const handleNoteClick = useCallback(
		(measureIndex: number | null, noteIndex: number | null) => {
			if (measureIndex === null || noteIndex === null) {
				setSelection(null);
				return;
			}
			setSelection((prev) =>
				prev &&
					prev.measureIndex === measureIndex &&
					prev.noteIndex === noteIndex
					? null
					: { measureIndex, noteIndex }
			);
		},
		[]
	);

	/* -------- Effects -------- */

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

	// Re-render staff, reapply active-measure + selection after render.
	useEffect(() => {
		let cancelled = false;
		const safeWidth = Math.max(canvasWidth, 280);
		(async () => {
			const handle = await renderScoreToElement(
				scoreContainerRef.current,
				safeWidth,
				score,
				handleNoteClick
			);
			if (cancelled) return;
			renderHandleRef.current = handle;
			if (!handle) return;
			if (activeMeasureRef.current !== null) {
				handle.setActiveMeasure(activeMeasureRef.current);
			}
			if (selection) {
				handle.setSelectedNote(
					selection.measureIndex,
					selection.noteIndex
				);
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [score, canvasWidth]);

	// Cheap path: selection changed but no re-render needed.
	useEffect(() => {
		const handle = renderHandleRef.current;
		if (!handle) return;
		if (selection) {
			handle.setSelectedNote(selection.measureIndex, selection.noteIndex);
		} else {
			handle.setSelectedNote(null, null);
		}
	}, [selection]);

	// Sync textarea with measure switch.
	useEffect(() => {
		setNotesInput(
			formatNotesToString(measures[safeMeasureIndex]?.voices?.[0]?.notes)
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [safeMeasureIndex]);

	// Clear selection if the referenced note no longer exists.
	useEffect(() => {
		if (!selection) return;
		const exists =
			measures[selection.measureIndex]?.voices?.[0]?.notes?.[
			selection.noteIndex
			] !== undefined;
		if (!exists) setSelection(null);
	}, [measures, selection]);

	useEffect(() => {
		return () => {
			if (synthRef.current) synthRef.current.dispose();
			Tone.Transport.stop();
			Tone.Transport.cancel(0);
			activeMeasureRef.current = null;
		};
	}, []);

	/* -------- Score mutation helpers -------- */

	const updateScore = (newScore: ScoreState) => {
		setAttributes({ score: newScore });
	};

	const updateSelectedNote = (patch: Partial<ScoreNote>) => {
		if (!selection) return;
		const newScore = cloneScore(score);
		const notes =
			newScore.tracks?.[0]?.measures?.[selection.measureIndex]?.voices?.[0]
				?.notes;
		if (!notes?.[selection.noteIndex]) return;
		notes[selection.noteIndex] = {
			...notes[selection.noteIndex],
			...patch,
		};
		updateScore(newScore);
	};

	/* -------- Palette operations -------- */

	const transposeNote = (semitones: number) => {
		if (!selectedNote || selectedNote.isRest) return;
		const newKeys = selectedNote.keys.map((k) =>
			transposeKey(k, semitones)
		);
		updateSelectedNote({ keys: newKeys });
	};

	const setAccidental = (acc: '' | '#' | 'b') => {
		if (!selectedNote || selectedNote.isRest) return;
		const newKeys = selectedNote.keys.map((k) =>
			setKeyAccidental(k, acc)
		);
		updateSelectedNote({ keys: newKeys });
	};

	const setDuration = (duration: string) =>
		updateSelectedNote({ duration });

	const cycleDots = () => {
		if (!selectedNote) return;
		updateSelectedNote({
			dots: ((selectedNote.dots || 0) + 1) % 3,
		});
	};

	const deleteSelectedNote = () => {
		if (!selection) return;
		const newScore = cloneScore(score);
		const notes =
			newScore.tracks?.[0]?.measures?.[selection.measureIndex]?.voices?.[0]
				?.notes;
		if (!notes) return;
		notes.splice(selection.noteIndex, 1);
		updateScore(newScore);
		setSelection(null);
	};

	const addNote = (isRest: boolean) => {
		const newScore = cloneScore(score);
		const voice =
			newScore.tracks?.[0]?.measures?.[safeMeasureIndex]?.voices?.[0];
		if (!voice) return;

		voice.notes.push({
			id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			keys: isRest ? [] : ['C4'],
			duration: 'q',
			isRest,
			dots: 0,
		});
		updateScore(newScore);
		setSelection({
			measureIndex: safeMeasureIndex,
			noteIndex: voice.notes.length - 1,
		});
	};

	/* -------- Textarea editing (unchanged) -------- */

	const handleNotesChange = (val: string) => {
		setNotesInput(val);

		const rawTokens = val
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		const validNotes: ScoreNote[] = [];

		rawTokens.forEach((token, index) => {
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
					if (
						(VALID_DURATIONS as readonly string[]).includes(cleanDur)
					) {
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

		if (validNotes.length > 0 || val.trim() === '') {
			const newScore = cloneScore(score);
			if (
				newScore.tracks?.[0]?.measures?.[safeMeasureIndex]?.voices?.[0]
			) {
				newScore.tracks[0].measures[safeMeasureIndex].voices[0].notes =
					validNotes;
				updateScore(newScore);
			}
		}
	};

	/* -------- Measure management -------- */

	const addMeasure = () => {
		const newScore = cloneScore(score);
		const track = newScore.tracks?.[0];
		if (!track) return;

		const refMeasure = track.measures[track.measures.length - 1];
		const newIndex = track.measures.length;
		const now = Date.now();

		track.measures.push({
			id: `measure-${now}`,
			index: newIndex,
			clef: refMeasure?.clef || 'treble',
			timeSignature: refMeasure?.timeSignature || '4/4',
			keySignature: refMeasure?.keySignature || 'C',
			voices: [{ id: `voice-${now}`, notes: [] }],
		});

		updateScore(newScore);
		setCurrentMeasureIndex(newIndex);
		setSelection(null);
	};

	const removeMeasure = () => {
		const newScore = cloneScore(score);
		const track = newScore.tracks?.[0];
		if (!track || track.measures.length <= 1) return;

		track.measures.pop();
		track.measures.forEach((m, i) => {
			m.index = i;
		});
		updateScore(newScore);

		if (safeMeasureIndex >= track.measures.length) {
			setCurrentMeasureIndex(track.measures.length - 1);
			setSelection(null);
		} else if (
			selection &&
			selection.measureIndex >= track.measures.length
		) {
			setSelection(null);
		}
	};

	/* -------- Playback (unchanged) -------- */

	const togglePlayback = async () => {
		if (isPlaying) {
			Tone.Transport.stop();
			Tone.Transport.cancel(0);
			setIsPlaying(false);
			activeMeasureRef.current = null;
			renderHandleRef.current?.setActiveMeasure(null);
			return;
		}

		await Tone.start();

		if (!synthRef.current) {
			synthRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
		}

		Tone.Transport.stop();
		Tone.Transport.cancel(0);
		Tone.Transport.bpm.value = score.playback.bpm || 120;

		if (score.playback.swing) {
			Tone.Transport.swing = 0.5;
			Tone.Transport.swingSubdivision = '8n';
		} else {
			Tone.Transport.swing = 0;
		}

		const track = score.tracks?.[0];
		const allMeasures = track?.measures ?? [];
		let anyNotes = false;
		let currentTime = 0;

		allMeasures.forEach((measure, measureIndex) => {
			const voice = measure?.voices?.[0];
			if (!voice?.notes?.length) return;
			anyNotes = true;

			const measureStart = currentTime;
			Tone.Transport.schedule((time) => {
				Tone.Draw.schedule(() => {
					activeMeasureRef.current = measureIndex;
					renderHandleRef.current?.setActiveMeasure(measureIndex);
				}, time);
			}, measureStart);

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
		});

		if (!anyNotes) return;

		Tone.Transport.schedule((time) => {
			Tone.Draw.schedule(() => {
				activeMeasureRef.current = null;
				renderHandleRef.current?.setActiveMeasure(null);
				setIsPlaying(false);
				Tone.Transport.stop();
			}, time);
		}, currentTime);

		Tone.Transport.start();
		setIsPlaying(true);
	};

	/* -------- Render -------- */

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

				{/* -------- NEW: note selection palette -------- */}
				<PanelBody
					title={__('Nota Selecionada', 'master-scores')}
					initialOpen={true}
				>
					{selectedNote && selection ? (
						<>
							<p style={{ marginTop: 0, color: '#666' }}>
								{__('Compasso', 'master-scores')}{' '}
								{selection.measureIndex + 1},{' '}
								{__('nota', 'master-scores')}{' '}
								{selection.noteIndex + 1}
								{' — '}
								{selectedNote.isRest
									? __('pausa', 'master-scores')
									: selectedNote.keys.join(', ')}
							</p>

							{!selectedNote.isRest && (
								<>
									<div
										style={{
											display: 'flex',
											gap: 4,
											marginBottom: 8,
										}}
									>
										<Button
											variant="secondary"
											style={{ flex: 1 }}
											onClick={() => transposeNote(-1)}
										>
											♭ ½ tom
										</Button>
										<Button
											variant="secondary"
											style={{ flex: 1 }}
											onClick={() => transposeNote(1)}
										>
											♯ ½ tom
										</Button>
									</div>

									<div
										style={{
											display: 'flex',
											gap: 4,
											marginBottom: 8,
										}}
									>
										<Button
											variant="secondary"
											style={{ flex: 1 }}
											onClick={() => transposeNote(-12)}
										>
											Oitava −
										</Button>
										<Button
											variant="secondary"
											style={{ flex: 1 }}
											onClick={() => transposeNote(12)}
										>
											Oitava +
										</Button>
									</div>

									<div
										style={{
											display: 'flex',
											gap: 4,
											marginBottom: 8,
										}}
									>
										<Button
											variant="secondary"
											style={{ flex: 1 }}
											onClick={() => setAccidental('b')}
										>
											♭
										</Button>
										<Button
											variant="secondary"
											style={{ flex: 1 }}
											onClick={() => setAccidental('')}
										>
											♮
										</Button>
										<Button
											variant="secondary"
											style={{ flex: 1 }}
											onClick={() => setAccidental('#')}
										>
											♯
										</Button>
									</div>
								</>
							)}

							<p
								style={{
									margin: '0 0 4px',
									fontWeight: 500,
								}}
							>
								{__('Duração', 'master-scores')}
							</p>
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: 'repeat(6, 1fr)',
									gap: 4,
									marginBottom: 8,
								}}
							>
								{DURATION_OPTIONS.map((d) => (
									<Button
										key={d}
										variant={
											(selectedNote.duration || 'q') === d
												? 'primary'
												: 'secondary'
										}
										onClick={() => setDuration(d)}
									>
										{d}
									</Button>
								))}
							</div>

							<Button
								variant="secondary"
								style={{ width: '100%', marginBottom: 8 }}
								onClick={cycleDots}
							>
								{__('Ponto', 'master-scores')} (
								{selectedNote.dots || 0})
							</Button>

							<Button
								variant="secondary"
								isDestructive
								style={{ width: '100%' }}
								onClick={deleteSelectedNote}
							>
								{__('Excluir nota', 'master-scores')}
							</Button>
						</>
					) : (
						<p style={{ marginTop: 0, color: '#666' }}>
							{__(
								'Clique numa nota (ou pausa) na pauta para editar. Clique de novo para desselecionar.',
								'master-scores'
							)}
						</p>
					)}

					<hr
						style={{
							margin: '12px 0',
							border: 0,
							borderTop: '1px solid #ddd',
						}}
					/>

					<p style={{ margin: '0 0 8px', fontWeight: 500 }}>
						{__('Adicionar ao compasso', 'master-scores')}{' '}
						{safeMeasureIndex + 1}
					</p>
					<div style={{ display: 'flex', gap: 4 }}>
						<Button
							variant="secondary"
							style={{ flex: 1 }}
							onClick={() => addNote(false)}
						>
							+ {__('Nota', 'master-scores')}
						</Button>
						<Button
							variant="secondary"
							style={{ flex: 1 }}
							onClick={() => addNote(true)}
						>
							+ {__('Pausa', 'master-scores')}
						</Button>
					</div>
				</PanelBody>

				<PanelBody title={__('Estrutura da Partitura', 'master-scores')}>
					<p style={{ marginTop: 0 }}>
						{__('Total de compassos:', 'master-scores')}{' '}
						{measures.length}
					</p>
					<div style={{ display: 'flex', gap: 8 }}>
						<Button variant="secondary" onClick={addMeasure}>
							<Plus size={14} />
							{__('Adicionar', 'master-scores')}
						</Button>
						<Button
							variant="secondary"
							isDestructive
							onClick={removeMeasure}
							disabled={measures.length <= 1}
						>
							<Trash size={14} />
							{__('Remover', 'master-scores')}
						</Button>
					</div>
				</PanelBody>

				<PanelBody title={__('Editor de Notas', 'master-scores')}>
					<RangeControl
						label={__('Compasso em edição', 'master-scores')}
						value={safeMeasureIndex}
						onChange={(val) => {
							setCurrentMeasureIndex(val ?? 0);
							setSelection(null);
						}}
						min={0}
						max={Math.max(0, measures.length - 1)}
						help={__(
							'Escolha qual compasso o campo abaixo edita. A reprodução toca a partitura inteira.',
							'master-scores'
						)}
					/>
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