import Admin from '../models/AdminModel.js';
import Employee from '../models/EmployeModele.js';
import Payroll from '../models/EmployeePayroll.js';
import Fabric from '../models/Fabric.js';
import FabricMovement from '../models/FabricMovement.js';
import TailoringOrder from '../models/TailoringOrder.js';
import { buildAdminSalesProfit } from '../../shared/adminSalesProfit.js';
import { buildAllProfits, validateAllProfitQuery } from '../../shared/allProfits.js';

export async function getAllProfits(req, res) {
  try {
    const filters = validateAllProfitQuery(req.query), idAdmin = req.user.id;
    const [admin, employees, accounts, fabrics, orders] = await Promise.all([
      Admin.findById(idAdmin).select('name ventes Facture').lean(),
      Employee.find({ idAdmin }).select('name isActive compensation ventes Facture').lean(),
      Payroll.find({ idAdmin }).select('employeeId plans').lean(),
      Fabric.find({ idAdmin }).select('movements').lean(),
      TailoringOrder.find({ idAdmin }).select('_id garmentType clientName phone barcode stockOperation deliveredAt cancelledAt deliveryFinancials totalPrice expenseAmount deliveryFabricItems items').lean(),
    ]);
    if (!admin) return res.status(404).json({ message: 'profitOwnerNotFound' });
    // Read pending movements BEFORE the archive. Archiving during the report
    // cannot lose a sale; fabricProfitEntries deduplicates movement IDs.
    const archived = await FabricMovement.find({ idAdmin, sale: { $exists: true } }).select('-sale.requestFingerprint -sale.clientId').lean();
    const { sales } = buildAdminSalesProfit(admin, employees, accounts);
    res.set('Cache-Control', 'no-store').json(buildAllProfits({ sales, orders, fabricMovements: [...archived, ...fabrics.flatMap(fabric => fabric.movements || []).filter(row => row.sale)] }, filters));
  } catch (error) {
    res.status(error.status === 400 ? 400 : 500).json({ message: error.status === 400 ? 'invalidProfitQuery' : 'loadAllProfitsFailed' });
  }
}
