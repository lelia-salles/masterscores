import { useBlockProps } from '@wordpress/block-editor';

export default function save( { attributes } ) {
	const blockProps = useBlockProps.save();

	const score = attributes.score ?? {
		metadata: {
			title: 'Master Scores',
			composer: 'Composer',
		},
	};

	return (
		<div
			{ ...blockProps }
			className="wp-block-create-block-master-scores"
			data-score={ JSON.stringify( score ) }
		>
			<div className="master-scores-frontend">
				<div className="master-scores-frontend-title">
					{ score.metadata?.title || 'Master Scores' }
				</div>
				<div className="master-scores-frontend-composer">
					{ score.metadata?.composer || '' }
				</div>
				
				{/* Contentor reservado para o VexFlow desenhar a pauta no frontend */}
				<div className="master-scores-canvas-container"></div>
			</div>
		</div>
	);
}