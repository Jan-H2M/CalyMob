import { StockHeader } from './StockHeader';
import { InventaireSettings } from '@/components/settings/InventaireSettings';

export function ConfigStockPage() {
  return (
    <div className="p-6">
      <StockHeader
        title="Configuration"
        description="Types de matériel, checklists et cautions"
      />
      <InventaireSettings />
    </div>
  );
}
