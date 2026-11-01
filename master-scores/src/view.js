import { Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';

const renderScore = ( score, element, width ) => {
	if ( ! element || ! score?.tracks?.length ) return;

	const track = score.tracks[0];
	const measure = track?.measures?.[0];
	const voiceData = measure?.voices?.[0];

	if ( ! measure || ! voiceData ) return;

	const canvasContainer = element.querySelector('.master-scores-canvas-container');
	if ( ! canvasContainer ) return;

	const canvasWidth = Math.max( width, 250 );
	const canvasHeight = 220;

	canvasContainer.innerHTML = '';

	const renderer = new Renderer( canvasContainer, Renderer.Backends.CANVAS );
	renderer.resize( canvasWidth, canvasHeight );

	const context = renderer.getContext();
	context.setFont( 'Arial', 10, '' ).setBackgroundFillStyle( '#f8fafc' );

	const stave = new Stave( 10, 40, canvasWidth - 20 );
	stave.addClef( measure.clef ).addTimeSignature( measure.timeSignature );
	stave.setContext( context ).draw();

	if ( voiceData.notes.length === 0 ) return;

	try {
		const notes = voiceData.notes.map( ( note ) => {
			const mappedKeys =
				note.isRest || note.keys.length === 0
					? [ 'b/4' ]
					: note.keys.map( ( key ) =>
							key.toLowerCase().replace( /(\w)(#|b)?(\d)/, '$1$2/$3' )
					  );

			return new StaveNote( {
				clef: measure.clef,
				keys: mappedKeys,
				duration: note.isRest ? `${ note.duration }r` : note.duration,
			} );
		} );

		const [ numBeats, beatValue ] = measure.timeSignature.split( '/' ).map( Number );
		const voice = new Voice( { numBeats, beatValue } );
		voice.setStrict( false );
		voice.addTickables( notes );

		new Formatter().joinVoices( [ voice ] ).format( [ voice ], canvasWidth - 40 );
		voice.draw( context, stave );
	} catch ( error ) {
		console.error( 'Master Scores: rendering error', error );
	}
};

document.addEventListener( 'DOMContentLoaded', () => {
	const blocks = document.querySelectorAll( '.wp-block-create-block-master-scores' );

	blocks.forEach( ( block ) => {
		const rawScore = block.getAttribute( 'data-score' );
		if ( ! rawScore ) return;

		try {
			const score = JSON.parse( rawScore );
			const canvasContainer = block.querySelector('.master-scores-frontend');

			if ( canvasContainer ) {
				const resizeObserver = new ResizeObserver( ( entries ) => {
					for ( const entry of entries ) {
						// Renderiza novamente a pauta com a largura nova do contentor
						renderScore( score, block, entry.contentRect.width );
					}
				} );
				
				resizeObserver.observe( canvasContainer );
			}
		} catch ( error ) {
			console.error( 'Master Scores: invalid score data', error );
		}
	} );
} );