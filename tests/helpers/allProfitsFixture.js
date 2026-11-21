import Admin from '../../BackEnd/models/AdminModel.js';
import Employee from '../../BackEnd/models/EmployeModele.js';
import Payroll from '../../BackEnd/models/EmployeePayroll.js';
import Fabric from '../../BackEnd/models/Fabric.js';
import FabricMovement from '../../BackEnd/models/FabricMovement.js';
import TailoringOrder from '../../BackEnd/models/TailoringOrder.js';
import { memoryQuery, matches } from './modelMemory.js';
import { TAILORING_GARMENT_TYPES } from '../../shared/tailoring.js';

export const owner = '111111111111111111111111', foreignOwner = '222222222222222222222222', employeeId = '333333333333333333333333';
const id = n => n.toString(16).padStart(24, '0');
export const profitSale = (profite, patch = {}) => ({ _id: id(1), name: 'منتج', price: 100, quantite: 1, saleAmount: 100, DateVante: '2026-11-05T12:00:00Z', profite, ...patch });
export const profitOrder = (patch = {}) => ({ _id: id(10), idAdmin: owner, clientName: 'زبونة', phone: '0611111111', garmentType: 'djellaba', deliveredAt: '2026-11-05T12:00:00Z', deliveryFinancials: { revenueAmount: 200, expenseAmount: 100, garmentCount: 1 }, items: [{ lineId: 'first', fabricSource: 'client' }], ...patch });
export const profitMovement = (patch = {}) => ({ _id: id(100), idAdmin: owner, createdBy: employeeId, occurredAt: '2026-11-05T12:00:00Z', meters: 2, sale: { total: 80, costAmount: 30, purchaseUnitPrice: 15, discountAmount: 0, createdByName: 'موظف', createdByRole: 'Employe' }, ...patch });
export function allProfitsFixture(t) {
  const admin = { _id: owner, name: 'المدير', ventes: [profitSale(40)] };
  const employees = [
    { _id: employeeId, idAdmin: owner, role: 'Employe', name: 'موظف بالثلث', isActive: true, compensation: { type: 'profitShare', effectiveMonth: '2026-01' }, ventes: [profitSale(900)] },
    { _id: id(2), idAdmin: owner, role: 'Employe', name: 'موظف شهري', isActive: false, compensation: { type: 'monthly', effectiveMonth: '2026-01', monthlyAmount: 3000 }, ventes: [profitSale(100)] },
    { _id: id(3), idAdmin: foreignOwner, name: 'متجر آخر', ventes: [profitSale(99999)] },
  ];
  const orders = TAILORING_GARMENT_TYPES.map((garmentType, index) => profitOrder({ _id: id(10 + index), garmentType }));
  orders[0].items = [{ lineId: 'first', fabricSource: 'shop', fabricMeters: 2, fabricType: 'ثوب', costs: { fabricAmount: 60, fabricUnitPrice: 30 }, fabricSale: { occurredAt: '2026-11-03T12:00:00Z', createdBy: employeeId, createdByRole: 'Employe', createdByName: 'موظف', purchaseUnitPrice: 20, costAmount: 40, profitAmount: 20 } }];
  const movements = [profitMovement()], fabrics = [{ _id: id(200), idAdmin: owner, movements: [movements[0]] }], accounts = [];
  t.mock.method(Admin, 'findById', key => memoryQuery(() => key === owner ? admin : key === foreignOwner ? { _id: foreignOwner, name: 'مدير آخر' } : null));
  t.mock.method(Employee, 'findById', key => memoryQuery(() => employees.find(row => String(row._id) === String(key))));
  for (const [Model, rows] of [[Employee, employees], [Payroll, accounts], [Fabric, fabrics], [FabricMovement, movements], [TailoringOrder, orders]]) t.mock.method(Model, 'find', scope => memoryQuery(() => rows.filter(row => matches(row, scope))));
  return { admin, employees, orders, movements, fabrics, accounts };
}
