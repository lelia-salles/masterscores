import { useBlockProps } from '@wordpress/block-editor';
export default function save() {
  const blockProps = useBlockProps.save();

  return (
    <div { ...blockProps }>
      <div className="master-scores-frontend-container">
        {/* Futuramente, nosso código injetará a pauta aqui para o usuário final */}
      </div>
    </div>
  );
}
