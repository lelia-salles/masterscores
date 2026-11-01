import { useEffect, useRef, useState } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, RangeControl, ToggleControl, TextareaControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { Play, Square, Save, Music } from 'lucide-react';
import { Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';
import * as Tone from 'tone';

import { initialScoreMock } from './mockScore';
import { ScoreState, ScoreNote } from './types/scores';

const cloneScore = ( score: ScoreState ): ScoreState =>
	JSON.parse( JSON.stringify( score ) );

// Mapeamento de duração do VexFlow (q = quarter) para o Tone.js (4n = quarter note)
const mapDurationToTone = ( duration: string ) => {
	const map: Record<string, string> = {
		'w': '1n',
		'h': '2n',
		'q': '4n',
		'8': '8n',
		'16': '16n',
		'32': '32n'
	};
	return map[duration] || '4n';
};

const renderScoreToCanvas = (
	canvas: HTMLCanvasElement | null,
	width: number,
	height: number,
	score: ScoreState | undefined
) => {
	if ( ! canvas || ! score?.tracks?.length ) {
		return;
	}

	const track = score.tracks[0];
	const measure = track?.measures?.[0];
	const voiceData = measure?.voices?.[0];

	if ( ! measure || ! voiceData ) {
		return;
	}

	const renderer = new Renderer( canvas, Renderer.Backends.CANVAS );
	renderer.resize( width, height );

	const context = renderer.getContext();
	context.clear(); // Limpa o canvas antes de desenhar novamente
	context.setFont( 'Arial', 10, '' ).setBackgroundFillStyle( '#f8fafc' );

	const stave = new Stave( 10, 40, width - 20 );
	stave.addClef( measure.clef ).addTimeSignature( measure.timeSignature );
	stave.setContext( context ).draw();

	if ( voiceData.notes.length === 0 ) return;

	try {
		const notes = voiceData.notes.map( ( note ) => {
			const mappedKeys =
				note.isRest || note.keys.length === 0
					? [ 'b/4' ]
					: note.keys.map( ( key ) =>
							key
								.toLowerCase()
								.replace( /(\w)(#|b)?(\d)/, '$1$2/$3' )
					  );

			return new StaveNote( {
				clef: measure.clef,
				keys: mappedKeys,
				duration: note.isRest ? `${ note.duration }r` : note.duration,
			} );
		} );

		const [ numBeats, beatValue ] = measure.timeSignature.split( '/' ).map( Number );
		const voice = new Voice( { numBeats, beatValue } );
		voice.setStrict( false ); // Permite desenhar o compasso mesmo se não estiver totalmente preenchido
		voice.addTickables( notes );

		new Formatter().joinVoices( [ voice ] ).format( [ voice ], width - 40 );
		voice.draw( context, stave );
	} catch ( error ) {
		console.error( "Erro ao renderizar pauta:", error );
	}
};

export default function Edit( { attributes, setAttributes } ) {
	const blockProps = useBlockProps( {
		className: 'wp-block-create-block-master-scores',
	} );

	const score: ScoreState = attributes.score ?? initialScoreMock;
	
	const canvasRef = useRef<HTMLCanvasElement>( null );
	const containerRef = useRef<HTMLDivElement>( null ); // Referencial para medir a largura da div
	
	const [ isPlaying, setIsPlaying ] = useState( false );
	const [ canvasWidth, setCanvasWidth ] = useState( 600 );
	const synthRef = useRef<Tone.PolySynth | null>( null );

	// Observa mudanças na largura da div contentora (Responsividade)
	useEffect( () => {
		if ( ! containerRef.current ) return;

		const resizeObserver = new ResizeObserver( ( entries ) => {
			for ( const entry of entries ) {
				setCanvasWidth( entry.contentRect.width ); 
			}
		} );

		resizeObserver.observe( containerRef.current );

		return () => resizeObserver.disconnect();
	}, [] );

	// Redesenha a pauta sempre que os dados (score) ou a largura (canvasWidth) mudarem
	useEffect( () => {
		// Garante uma largura mínima (250px) para evitar erros de formatação no VexFlow
		const safeWidth = Math.max( canvasWidth, 250 );
		renderScoreToCanvas( canvasRef.current, safeWidth, 220, score );
	}, [ score, canvasWidth ] );

	// Limpa os recursos do Tone.js quando o componente for destruído (ao fechar o editor)
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

	const togglePlayback = async () => {
		if ( isPlaying ) {
			Tone.Transport.stop();
			Tone.Transport.cancel( 0 );
			setIsPlaying( false );
			return;
		}

		await Tone.start(); // Essencial para navegadores modernos permitirem áudio

		if ( ! synthRef.current ) {
			synthRef.current = new Tone.PolySynth( Tone.Synth ).toDestination();
		}

		Tone.Transport.bpm.value = score.playback.bpm;
		Tone.Transport.cancel( 0 );

		let currentTime = 0;
		const track = score.tracks[0];
		const measure = track?.measures[0];
		const voice = measure?.voices[0];

		if ( voice && voice.notes ) {
			voice.notes.forEach( ( note ) => {
				const toneDuration = mapDurationToTone( note.duration );
				
				if ( ! note.isRest && note.keys.length > 0 ) {
					Tone.Transport.schedule( ( time ) => {
						synthRef.current?.triggerAttackRelease( note.keys, toneDuration, time );
					}, currentTime );
				}
				
				// O Tone.Time calcula o avanço tendo em conta o BPM e a figura rítmica (ex: 4n)
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

	// Converte texto cru numa estrutura JSON ScoreNote[]
	const handleNotesChange = ( val: string ) => {
		const newScore = cloneScore( score );
		const rawNotes = val.split( ',' ).map( s => s.trim() ).filter( Boolean );
		
		const newNotes: ScoreNote[] = rawNotes.map( ( rawNote, index ) => {
			const isRest = rawNote.toUpperCase() === 'REST';
			return {
				id: `note-${ index }`,
				keys: isRest ? [] : rawNote.split( ' ' ), // Separa acordes ex: "C4 E4"
				duration: 'q', // Fixa em semínimas (quarter note) nesta versão inicial
				isRest,
				dots: 0
			};
		} );
		
		if ( newScore.tracks[0] && newScore.tracks[0].measures[0] && newScore.tracks[0].measures[0].voices[0] ) {
			newScore.tracks[0].measures[0].voices[0].notes = newNotes;
		}
		
		updateScore( newScore );
	};

	const notesString = score.tracks[0]?.measures[0]?.voices[0]?.notes
		.map( n => n.isRest ? 'REST' : n.keys.join( ' ' ) )
		.join( ', ' );

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
						value={ notesString }
						onChange={ handleNotesChange }
						help={ __( 'Exemplo de uso: C4, D4, REST, E4 G4', 'master-scores' ) }
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
							className={`master-scores-button ${isPlaying ? '' : 'master-scores-button-primary'}`}
							onClick={ togglePlayback }
						>
							{ isPlaying ? <Square size={ 16 } /> : <Play size={ 16 } /> }
							{ isPlaying ? __( 'Parar', 'master-scores' ) : __( 'Tocar', 'master-scores' ) }
						</button>

						<button
							type="button"
							className="master-scores-button"
							onClick={ () => setAttributes( { score: cloneScore(score) } ) }
						>
							<Save size={ 16 } />
							Forçar Gravação
						</button>
					</div>
				</div>

				<div className="master-scores-score-panel" ref={ containerRef }>
					<div className="master-scores-header">
						<h2>{ score.metadata.title }</h2>
						<p>{ score.metadata.composer }</p>
					</div>

					<canvas
						ref={ canvasRef }
						className="master-scores-canvas"
						width={ canvasWidth }
						height={ 220 }
					/>
				</div>
			</div>
		</div>
	);
}