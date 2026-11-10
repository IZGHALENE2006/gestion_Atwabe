import mongoose from '../../BackEnd/node_modules/mongoose/index.js';
import Fabric from '../../BackEnd/models/Fabric.js';
import TailoringOrder from '../../BackEnd/models/TailoringOrder.js';
import FabricMovement from '../../BackEnd/models/FabricMovement.js';
import { djellabaFixture, query } from './djellabaCostsFixture.js';

export function tailoringStockFixture(t) {
  const f=djellabaFixture(t), controls={};
  const chain=fn=>({...query(fn),session(){return this;}});
  t.mock.method(FabricMovement,'find',()=>query(()=>[]));
  t.mock.method(Fabric,'findOne',scope=>chain(()=>{const row=f.fabrics.get(String(scope._id));return row&&String(row.idAdmin)===String(scope.idAdmin)?new Fabric(row.toObject()):null;}));
  t.mock.method(Fabric.prototype,'save',async function(){
    await this.validate();const old=f.fabrics.get(String(this._id));
    if(controls.failFabricBefore)throw new Error('Isolated fabric write failure');
    if(controls.conflictFabricOnce){delete controls.conflictFabricOnce;throw Object.assign(new Error('Conflict'),{name:'VersionError'});}
    if(old&&old.__v!==this.__v)throw Object.assign(new Error('Conflict'),{name:'VersionError'});
    this.__v=(this.__v||0)+1;f.fabrics.set(String(this._id),new Fabric(this.toObject()));
    if(controls.failFabricAfter)throw new Error('Isolated lost stock acknowledgement');
    return this;
  });
  t.mock.method(TailoringOrder,'findOne',scope=>chain(()=>{const row=[...f.orders.values()].find(row=>String(row.idAdmin)===String(scope.idAdmin)&&(!scope._id||String(row._id)===String(scope._id))&&(!scope.requestId||row.requestId===scope.requestId));return row?new TailoringOrder(row.toObject()):null;}));
  const createBase=TailoringOrder.create,saveBase=TailoringOrder.prototype.save;
  t.mock.method(TailoringOrder,'create',async value=>{
    if(controls.failOrderCreate)throw new Error('Isolated failed order create');
    if(Array.isArray(value)){const saved=await Promise.all(value.map(row=>createBase(row)));for(const row of saved)f.orders.set(String(row._id),new TailoringOrder(row.toObject()));return saved;}
    const saved=await createBase(value);f.orders.set(String(saved._id),new TailoringOrder(saved.toObject()));if(controls.afterIntent){const callback=controls.afterIntent;delete controls.afterIntent;callback();}return saved;
  });
  t.mock.method(TailoringOrder.prototype,'save',async function(){
    if(controls.failOrderCommitOnce&&!this.stockOperation&&f.orders.get(String(this._id))?.stockOperation){delete controls.failOrderCommitOnce;throw new Error('Isolated order commit failure');}
    return saveBase.call(this);
  });
  t.mock.method(TailoringOrder,'deleteOne',async scope=>{const row=f.orders.get(String(scope._id));if(!row||String(row.idAdmin)!==String(scope.idAdmin)||row.__v!==scope.__v)return {deletedCount:0};f.orders.delete(String(scope._id));return {deletedCount:1};});
  const snapshot=()=>({orders:[...f.orders].map(([id,row])=>[id,row.toObject()]),fabrics:[...f.fabrics].map(([id,row])=>[id,row.toObject()])});
  const restore=state=>{f.orders.clear();f.fabrics.clear();for(const [id,row]of state.orders)f.orders.set(id,new TailoringOrder(row));for(const [id,row]of state.fabrics)f.fabrics.set(id,new Fabric(row));};
  let queue=Promise.resolve();
  t.mock.method(mongoose,'startSession',async()=>({endSession:async()=>{},withTransaction:async fn=>{
    if(controls.standalone)throw Object.assign(new Error('Transaction numbers are only allowed on a replica set member'),{code:20});
    let unlock;const previous=queue;queue=new Promise(resolve=>{unlock=resolve;});await previous;
    const state=snapshot();try{let result=await fn();if(controls.retryTransactionOnce){delete controls.retryTransactionOnce;restore(state);result=await fn();}return result;}catch(error){restore(state);throw error;}finally{unlock();}
  }}));
  const fabric=f.seedFabric(30);fabric.purchasePricePerMeter=15;fabric.__v=0;
  f.seedSettings({thinSfifaCostPrice:25,thinSfifaPrice:40,thickSfifaCostPrice:50,thickSfifaPrice:70,laborPrice:0});
  Object.assign(f.staff,{name:'سعيد',moduleAccess:['tailoring','fabrics'],operationPermissions:{tailoring:['add','update','details','payment','deliver','cancel'],fabrics:['profits','delete','deletePiece','update']}});
  const meters=(chosen=fabric,color=0,piece=0)=>f.fabrics.get(String(chosen._id)).colors[color].pieces[piece].meters;
  return {...f,controls,fabric,meters};
}
