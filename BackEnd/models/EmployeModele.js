import mongoose from 'mongoose'

import bcrypt from "bcryptjs";
import { PAYMENT_METHOD_VALUES } from "../../shared/paymentMethods.js";

const ShemaEmploye = new mongoose.Schema(
    {
        idAdmin:Object,
        name:String,
        phone:String,
        cin:String,
        email:String,
        password:String,
        isActive:Boolean,
        color:String,
        action:{
            delete:{
                type:Boolean,
                default:false,
            },add:{
                   type:Boolean,
                default:false,
            },update:{
                   type:Boolean,
                default:false,
            }
        },
        role:{
            type:String,
            default:"Employe"
        },

       datecreate:{
        type:Date,
        default:new Date()
       },
           ventes:[
                        {
                       
                           idProduct :{
                            type:mongoose.Schema.Types.ObjectId,
                            ref:"Products"
                           },
                           name:String,
                           nameEmp:String,

                           price:Number,
                          priceType:{ type:String, enum:["retail", "wholesale"], default:"retail" },
                          batchId: String, batchNumber: Number,

                           quantite:Number,
                           profite : Number,
                           saleAmount: { type: Number, min: 0, default: undefined },
                           invoiceId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
                           saleType: { type: String, enum: ["cash", "credit"], default: "cash" },
                           DateVante :{
                            type:Date,
                            default:Date.now

                           }
       
                       }
                   ],
                                  Facture:[
                    {
                      Product:[
                        {
                          idProduct:{ type:mongoose.Schema.Types.ObjectId, ref:"Products" },
                          name:String,
                          price:Number,
                          priceType:{ type:String, enum:["retail", "wholesale"], default:"retail" },
                          batchId: String, batchNumber: Number,
                          quantite:Number,
                          code:String,
                          vatRate:{ type:Number, min:0, max:100 },
                          vatAmount:{ type:Number, min:0 },
                          totalHT:{ type:Number, min:0 },
                          totalTTC:{ type:Number, min:0 },
                          orderDiscountAmount:{ type:Number, min:0 },
                          TotalPrix:Number,
                          subtotal:Number,
                          discountType:{ type:String, enum:["percent", "amount"], default:"percent" },
                          discountValue:{ type:Number, default:0, min:0 },
                          discountAmount:{ type:Number, default:0, min:0 }
                        }
                      ],
                        nameEmp:String,
                      clientName:{ type:String, trim:true, maxlength:160 },
                      clientId:{ type:mongoose.Schema.Types.ObjectId, ref:"Client" },
                      saleType: { type: String, enum: ["cash", "credit"], default: "cash" },
                      creditUserId: { type: mongoose.Schema.Types.ObjectId, ref: "UserCridit" },
                      remainingAmount: { type: Number, min: 0 },
                      invoiceOrigin:{ type:String, enum:["manual", "cashier"], default:"cashier" },
                      paymentMethod:{ type:String, enum:PAYMENT_METHOD_VALUES },
                      vatRate:{ type:Number, min:0, max:100 },
                      vatAmount:{ type:Number, min:0 },
                      totalHT:{ type:Number, min:0 },
                      TotalQauntite:Number,
                      TotalPrix:Number,
                      totalOrder:Number,
                      PrixReture:Number,
                      subtotal:Number,
                      discountType:{ type:String, enum:["percent", "amount"], default:"percent" },
                      discountValue:{ type:Number, default:0, min:0 },
                      discountAmount:{ type:Number, default:0, min:0 },
                      lineDiscountAmount:{ type:Number, default:0, min:0 },
                      orderDiscountAmount:{ type:Number, min:0 },
                      amountPaid:Number,
                     DateFacture :{
                            type:Date,
                            default:Date.now

                           }
                    }
                   ]

       
    }
)

export default mongoose.model('Employes',ShemaEmploye)
