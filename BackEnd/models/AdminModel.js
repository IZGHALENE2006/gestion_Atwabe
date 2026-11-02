import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { PAYMENT_METHOD_VALUES } from "../../shared/paymentMethods.js";
import { invoiceSettingsSchema } from "./InvoiceSettings.js";
const AdminShema = new mongoose.Schema(
        {
            name:String,
            email:String,
            password :String,
            invoiceSettings: { type: invoiceSettingsSchema, default: () => ({}) },
            role:{
              type:String,
              default:"admin"
            },
           ventes:[
                       {
                       
                           idProduct:{
                            type:mongoose.Schema.Types.ObjectId,
                            ref:"Products"
                           },
                           name:String,

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
                      TotalQauntite:Number,
                      TotalPrix:Number,
                      totalOrder:Number,
                      PrixReture:Number,
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
AdminShema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

export default mongoose.model("Admin",AdminShema)
