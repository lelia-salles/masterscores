import { useEffect, useRef, useState } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, RangeControl, ToggleControl, TextareaControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { Play, Square, Save, Music } from 'lucide-react';
import { Renderer, Stave, StaveNote, Formatter, Voice, Accidental, VexFlow } from 'vexflow';
import * as Tone from 'tone';

import { initialScoreMock } from './mockScore';
import { ScoreState, ScoreNote } from './types/scores';

const cloneScore = ( score: ScoreState ): ScoreState =>
	JSON.parse( JSON.stringify( score ) );

const mapDurationToTone = ( duration: string ) => {
	const map: Record<string, string> = {
		w: '1n',
		h: '2n',
		q: '4n',
		'8': '8n',
		'16': '16n',
		'32': '32n',
	};
	return map[ duration ] || '4n';
};

// Garante que a fonte Bravura está carregada tanto na janela principal como no iframe do editor
const ensureFontsInDocument = async ( el: HTMLElement | null ) => {
	await VexFlow.loadFonts( 'Bravura', 'Academico' );
	const ownerDoc = el?.ownerDocument;
	if ( ownerDoc && ownerDoc !== document && 'fonts' in ownerDoc ) {
		document.fonts.forEach( ( fontFace ) => {
			if ( fontFace.family.includes( 'Bravura' ) || fontFace.family.includes( 'Academico' ) ) {
				ownerDoc.fonts.add( fontFace );
			}
		} );
	}
};

const renderScoreToElement = async (
	container: HTMLDivElement | null,
	width: number,
	height: number,
	score: ScoreState | undefined
) => {
	if ( ! container || ! score?.tracks?.length ) {
		return;
	}

	const track = score.tracks[ 0 ];
	const measure = track?.measures?.[ 0 ];
	const voiceData = measure?.voices?.[ 0 ];

	if ( ! measure || ! voiceData ) {
		return;
	}

	await ensureFontsInDocument( container );

	container.innerHTML = '';

	const renderer = new Renderer( container, Renderer.Backends.SVG );
	renderer.resize( width, height );

	const context = renderer.getContext();

	const stave = new Stave( 10, 40, Math.max( width - 20, 200 ) );
	stave.addClef( measure.clef || 'treble' ).addTimeSignature( measure.timeSignature || '4/4' );
	stave.setContext( context ).draw();

	if ( ! voiceData.notes || voiceData.notes.length === 0 ) {
		return;
	}

	try {
		const vexNotes = voiceData.notes.map( ( note ) => {
			const isRest = note.isRest || ! note.keys || note.keys.length === 0;
			const mappedKeys = isRest
				? [ 'b/4' ]
				: note.keys.map( ( key ) => {
						const cleanKey = key.trim().toLowerCase();
						return cleanKey.replace( /^([a-g])(#|b)?(\d)$/, '$1$2/$3' );
				  } );

			const staveNote = new StaveNote( {
				clef: measure.clef || 'treble',
				keys: mappedKeys,
				duration: isRest ? `${ note.duration || 'q' }r` : ( note.duration || 'q' ),
			} );

			if ( ! isRest ) {
				note.keys.forEach( ( key, idx ) => {
					const match = key.trim().match( /^[a-gA-G](#|b)\d$/ );
					if ( match && match[ 1 ] ) {
						staveNote.addModifier( new Accidental( match[ 1 ] ), idx );
					}
				} );
			}

			return staveNote;
		} );

		const [ numBeats, beatValue ] = ( measure.timeSignature || '4/4' ).split( '/' ).map( Number );
		const voice = new Voice( { numBeats: numBeats || 4, beatValue: beatValue || 4 } );
		voice.setStrict( false );
		voice.addTickables( vexNotes );

		new Formatter().joinVoices( [ voice ] ).format( [ voice ], Math.max( width - 90, 150 ) );
		voice.draw( context, stave );
	} catch ( error ) {
		console.error( 'Erro ao renderizar a pauta VexFlow:', error );
	}
};

const formatNotesToString = ( notes: ScoreNote[] = [] ) =>
	notes.map( ( n ) => ( n.isRest ? 'REST' : n.keys.join( ' ' ) ) ).join( ', ' );

export default function Edit( { attributes, setAttributes } ) {
	const blockProps = useBlockProps( {
		className: 'wp-block-create-block-master-scores',
	} );

	const score: ScoreState = attributes.score ?? initialScoreMock;

	const scoreContainerRef = useRef<HTMLDivElement>( null );
	const panelRef = useRef<HTMLDivElement>( null );

	const [ isPlaying, setIsPlaying ] = useState( false );
	const [ canvasWidth, setCanvasWidth ] = useState( 600 );
	const [ notesInput, setNotesInput ] = useState( () =>
		formatNotesToString( score.tracks?.[ 0 ]?.measures?.[ 0 ]?.voices?.[ 0 ]?.notes )
	);

	const synthRef = useRef<Tone.PolySynth | null>( null );

	useEffect( () => {
		if ( ! panelRef.current ) return;

		const resizeObserver = new ResizeObserver( ( entries ) => {
			for ( const entry of entries ) {
				setCanvasWidth( Math.floor( entry.contentRect.width ) );
			}
		} );

		resizeObserver.observe( panelRef.current );
		return () => resizeObserver.disconnect();
	}, [] );

	useEffect( () => {
		const safeWidth = Math.max( canvasWidth, 280 );
		renderScoreToElement( scoreContainerRef.current, safeWidth, 220, score );
	}, [ score, canvasWidth ] );

	useEffect( () => {
		return () => {
			if ( synthRef.current ) {
				synthRef.current.dispose();
			}
			Tone.Transport.stop();
			Tone.Transport.cancel( 0 );
		};
	}, [] );

	const updateScore = ( newScore: ScoreState ) => {
		setAttributes( { score: newScore } );
	};

	const handleNotesChange = ( val: string ) => {
		// Atualiza o texto livremente para permitir digitar vírgulas e espaços
		setNotesInput( val );

		const rawTokens = val
			.split( ',' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );

		const validNotes: ScoreNote[] = [];

		rawTokens.forEach( ( token, index ) => {
			if ( token.toUpperCase() === 'REST' ) {
				validNotes.push( {
					id: `note-${ index }`,
					keys: [],
					duration: 'q',
					isRest: true,
					dots: 0,
				} );
				return;
			}

			const keys = token
				.split( /\s+/ )
				.map( ( k ) => k.trim().toUpperCase() )
				.filter( ( k ) => /^[A-G](#|B)?[1-7]$/.test( k ) )
				.map( ( k ) => k.replace( 'B', 'b' ).replace( /^b/, 'B' ) );

			if ( keys.length > 0 ) {
				validNotes.push( {
					id: `note-${ index }`,
					keys,
					duration: 'q',
					isRest: false,
					dots: 0,
				} );
			}
		} );

		if ( validNotes.length > 0 ) {
			const newScore = cloneScore( score );
			if ( newScore.tracks?.[ 0 ]?.measures?.[ 0 ]?.voices?.[ 0 ] ) {
				newScore.tracks[ 0 ].measures[ 0 ].voices[ 0 ].notes = validNotes;
				updateScore( newScore );
			}
		}
	};

	const togglePlayback = async () => {
		if ( isPlaying ) {
			Tone.Transport.stop();
			Tone.Transport.cancel( 0 );
			setIsPlaying( false );
			return;
		}

		await Tone.start();

		if ( ! synthRef.current ) {
			synthRef.current = new Tone.PolySynth( Tone.Synth ).toDestination();
		}

		Tone.Transport.stop();
		Tone.Transport.cancel( 0 );
		Tone.Transport.bpm.value = score.playback.bpm || 120;

		let currentTime = 0;
		const voice = score.tracks?.[ 0 ]?.measures?.[ 0 ]?.voices?.[ 0 ];

		if ( voice?.notes?.length ) {
			voice.notes.forEach( ( note ) => {
				const toneDuration = mapDurationToTone( note.duration );

				if ( ! note.isRest && note.keys.length > 0 ) {
					const cleanKeys = note.keys.map( ( k ) => {
						const m = k.trim().match( /^([a-gA-G])(#|b)?(\d)$/ );
						return m ? `${ m[ 1 ].toUpperCase() }${ m[ 2 ] || '' }${ m[ 3 ] }` : 'C4';
					} );

					Tone.Transport.schedule( ( time ) => {
						synthRef.current?.triggerAttackRelease( cleanKeys, toneDuration, time );
					}, currentTime );
				}

				currentTime += Tone.Time( toneDuration ).toSeconds();
			} );
		}

		Tone.Transport.schedule( ( time ) => {
			Tone.Draw.schedule( () => {
				setIsPlaying( false );
				Tone.Transport.stop();
			}, time );
		}, currentTime );

		Tone.Transport.start();
		setIsPlaying( true );
	};

	return (
		<div { ...blockProps }>
			<InspectorControls>
				<PanelBody title={ __( 'Metadados da Partitura', 'master-scores' ) }>
					<TextControl
						label={ __( 'Título', 'master-scores' ) }
						value={ score.metadata.title }
						onChange={ ( val ) => {
							const newScore = cloneScore( score );
							newScore.metadata.title = val;
							updateScore( newScore );
						} }
					/>
					<TextControl
						label={ __( 'Compositor', 'master-scores' ) }
						value={ score.metadata.composer }
						onChange={ ( val ) => {
							const newScore = cloneScore( score );
							newScore.metadata.composer = val;
							updateScore( newScore );
						} }
					/>
				</PanelBody>

				<PanelBody title={ __( 'Reprodução de Áudio', 'master-scores' ) }>
					<RangeControl
						label={ __( 'BPM (Tempo)', 'master-scores' ) }
						value={ score.playback.bpm }
						onChange={ ( val ) => {
							const newScore = cloneScore( score );
							newScore.playback.bpm = val ?? 120;
							updateScore( newScore );
						} }
						min={ 40 }
						max={ 240 }
					/>
					<ToggleControl
						label={ __( 'Aplicar Swing', 'master-scores' ) }
						checked={ score.playback.swing }
						onChange={ ( val ) => {
							const newScore = cloneScore( score );
							newScore.playback.swing = val;
							updateScore( newScore );
						} }
					/>
				</PanelBody>

				<PanelBody title={ __( 'Editor de Notas', 'master-scores' ) }>
					<TextareaControl
						label={ __( 'Sequência Musical (separada por vírgula)', 'master-scores' ) }
						value={ notesInput }
						onChange={ handleNotesChange }
						help={ __( 'Exemplo: C4, D4, E4, REST, C4 E4 G4', 'master-scores' ) }
					/>
				</PanelBody>
			</InspectorControls>

			<div className="master-scores-editor">
				<div className="master-scores-toolbar">
					<div className="master-scores-brand">
						<div className="master-scores-brand-icon">
							<Music size={ 18 } />
						</div>
						<div>
							<strong>{ score.metadata.title }</strong>
						</div>
					</div>

					<div className="master-scores-actions">
						<button
							type="button"
							className={ `master-scores-button ${ isPlaying ? '' : 'master-scores-button-primary' }` }
							onClick={ togglePlayback }
						>
							{ isPlaying ? <Square size={ 16 } /> : <Play size={ 16 } /> }
							{ isPlaying ? __( 'Parar', 'master-scores' ) : __( 'Tocar', 'master-scores' ) }
						</button>

						<button
							type="button"
							className="master-scores-button"
							onClick={ () => updateScore( cloneScore( score ) ) }
						>
							<Save size={ 16 } />
							{ __( 'Forçar Gravação', 'master-scores' ) }
						</button>
					</div>
				</div>

				<div className="master-scores-score-panel" ref={ panelRef }>
					<div className="master-scores-header">
						<h2>{ score.metadata.title }</h2>
						<p>{ score.metadata.composer }</p>
					</div>

					<div
						ref={ scoreContainerRef }
						className="master-scores-canvas"
					/>
				</div>
			</div>
		</div>
	);
}