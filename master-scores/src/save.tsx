import type { BlockSaveProps } from '@wordpress/blocks';
import { BlockAttributes } from './types/scores';

export default function save({ attributes }: BlockSaveProps<BlockAttributes>) {
	const { score } = attributes;
	return (
		<div className="wp-block-create-block-master-scores">
			<div className="master-scores-score-panel">
				<div className="master-scores-header">
					<h2>{score.metadata.title}</h2>
					<p>{score.metadata.composer}</p>
				</div>
				<div
					className="master-scores-canvas"
					data-score={JSON.stringify(score)}
				/>
			</div>
		</div>
	);
}