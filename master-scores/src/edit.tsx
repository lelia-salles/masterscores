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

export default function Edit( { attributes, setAttributes } ) {
	const blockProps = useBlockProps( {
		className: 'wp-block-create-block-master-scores',
	} );

	const score: ScoreState = attributes.score ?? initialScoreMock;
	const canvasRef = useRef<HTMLCanvasElement>( null );

	useEffect( () => {
		renderScoreToCanvas( canvasRef.current, 600, 220, score );
	}, [ score ] );

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
							onClick={ () => {} }
						>
							<Play size={ 16 } />
							Play audio
						</button>

						<button
							type="button"
							className="master-scores-button"
							onClick={ () => setAttributes( { score } ) }
						>
							<Save size={ 16 } />
							Save score
						</button>
					</div>
				</div>

				<div className="master-scores-score-panel">
					<div className="master-scores-header">
						<h2>{ score.metadata.title }</h2>
						<p>{ score.metadata.composer }</p>
					</div>

					<canvas
						ref={ canvasRef }
						className="master-scores-canvas"
						width={ 600 }
						height={ 220 }
					/>
				</div>
			</div>
		</div>
	);
}