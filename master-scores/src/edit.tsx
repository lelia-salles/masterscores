import { useEffect, useRef, useState } from '@wordpress/element';
import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { Play, Square, Save, Music } from 'lucide-react';
import { Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';
import * as Tone from 'tone';

import { initialScoreMock } from './mockScore';
import { ScoreState } from './types/scores';

const cloneScore = ( score: ScoreState ): ScoreState =>
	JSON.parse( JSON.stringify( score ) );

const renderScoreToCanvas = (
	container: HTMLDivElement | null,
	width: number,
	height: number,
	score: ScoreState | undefined
) => {
	if ( ! container || ! score?.tracks?.length ) {
		return;
	}

	const track = score.tracks[0];
	const measure = track?.measures?.[0];
	const voiceData = measure?.voices?.[0];

	if ( ! measure || ! voiceData ) {
		return;
	}

	container.innerHTML = '';

	const renderer = new Renderer( container, Renderer.Backends.CANVAS );
	renderer.resize( width, height );

	const context = renderer.getContext();
	context.setFont( 'Arial', 10, '' ).setBackgroundFillStyle( '#f8fafc' );

	const stave = new Stave( 10, 40, width - 20 );
	stave.addClef( measure.clef ).addTimeSignature( measure.timeSignature );
	stave.setContext( context ).draw();

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
	voice.addTickables( notes );

	new Formatter().joinVoices( [ voice ] ).format( [ voice ], width - 40 );
	voice.draw( context, stave );
};

const getToneDuration = ( duration: string ): string => {
	switch ( duration ) {
		case 'w':
			return '1n';
		case 'h':
			return '2n';
		case 'q':
			return '4n';
		default:
			return '8n';
	}
};

const playScore = async ( score: ScoreState ) => {
	await Tone.start();

	const synth = new Tone.PolySynth( Tone.Synth ).toDestination();
	const track = score.tracks[0];
	const measure = track?.measures?.[0];
	const voiceData = measure?.voices?.[0];

	if ( ! voiceData ) {
		return 0;
	}

	let currentTime = Tone.now();

	voiceData.notes.forEach( ( note ) => {
		const toneDuration = getToneDuration( note.duration );

		if ( ! note.isRest && note.keys.length > 0 ) {
			synth.triggerAttackRelease( note.keys, toneDuration, currentTime );
		}

		currentTime += Tone.Time( toneDuration ).toSeconds();
	} );

	return currentTime;
};

export default function Edit( { attributes, setAttributes } ) {
	const blockProps = useBlockProps( {
		className: 'wp-block-create-block-master-scores',
	} );

	const score: ScoreState = attributes.score ?? initialScoreMock;
	const containerRef = useRef<HTMLDivElement>( null );
	const timeoutRef = useRef<number | null>( null );
	const [ isPlaying, setIsPlaying ] = useState( false );

	useEffect( () => {
		renderScoreToCanvas( containerRef.current, 600, 220, score );

		return () => {
			if ( timeoutRef.current ) {
				window.clearTimeout( timeoutRef.current );
			}
		};
	}, [ score ] );

	const stopPlayback = () => {
		if ( timeoutRef.current ) {
			window.clearTimeout( timeoutRef.current );
			timeoutRef.current = null;
		}

		Tone.Transport.stop();
		Tone.Transport.cancel( 0 );
		setIsPlaying( false );
	};

	const updateFirstNote = () => {
		const nextScore = cloneScore( score );
		const notes = nextScore.tracks[0]?.measures[0]?.voices[0]?.notes;

		if ( ! notes || ! notes.length ) {
			return;
		}

		const firstNote = notes[0];
		const scale = [ 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5' ];
		const currentIndex = scale.indexOf( firstNote.keys[0] || 'C4' );
		const nextIndex = currentIndex + 1 >= scale.length ? 0 : currentIndex + 1;

		firstNote.keys = [ scale[ nextIndex ] ];
		setAttributes( { score: nextScore } );
	};

	const handleTogglePlayback = async () => {
		if ( isPlaying ) {
			stopPlayback();
			return;
		}

		setIsPlaying( true );

		try {
			const totalPlayTime = await playScore( score );
			const durationSeconds = Math.max( totalPlayTime - Tone.now(), 0 );

			timeoutRef.current = window.setTimeout( () => {
				stopPlayback();
			}, Math.max( durationSeconds * 1000, 100 ) );
		} catch ( error ) {
			console.error( 'Master Scores: playback failed', error );
			stopPlayback();
		}
	};

	return (
		<div { ...blockProps }>
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
							className="master-scores-button master-scores-button-primary"
							onClick={ handleTogglePlayback }
						>
							{ isPlaying ? <Square size={ 16 } /> : <Play size={ 16 } /> }
							{ isPlaying ? __( 'Stop audio', 'master-scores' ) : __( 'Play audio', 'master-scores' ) }
						</button>

						<button
							type="button"
							className="master-scores-button"
							onClick={ () => setAttributes( { score: cloneScore( score ) } ) }
						>
							<Save size={ 16 } />
							{ __( 'Save score', 'master-scores' ) }
						</button>
					</div>
				</div>

				<div className="master-scores-score-panel">
					<div className="master-scores-header">
						<h2>{ score.metadata.title }</h2>
						<p>{ score.metadata.composer }</p>
					</div>

					<div
						ref={ containerRef }
						onClick={ updateFirstNote }
						className="master-scores-canvas"
					/>
				</div>
			</div>
		</div>
	);
}
