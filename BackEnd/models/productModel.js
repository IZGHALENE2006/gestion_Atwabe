    import mongoose from 'mongoose'
    import { productBatchSchema } from './productBatchSchema.js';


    export const ProductShema  = new mongoose.Schema(
        {
            idAdmin:{
             type: mongoose.Schema.Types.ObjectId,
             ref: "Admin"
             },
            name:String,
            image:{ type:String, default:"" },
            quantite:Number,
            stockBatches: { type: [productBatchSchema], default: undefined },
            creditStockDebits: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
            barcode:String,
            prix_achat:Number,
            prix_vente:Number,
            prix_gros:{ type:Number, default:null, min:0 },
            frais_total:{ type:Number, default:0, min:0 },
            frais_quantite:{ type:Number, default:0, min:0 },
            frais_unitaire:{ type:Number, default:0, min:0 },
            profite:Number,
            categorie:{
                type:mongoose.Schema.Types.ObjectId,
                ref:"Categories",
                required:true
            },
            fournisseur:String,
            datecreate:Date,
            dateupdate:Date,
            status:Boolean
        
    }
    )
    export default mongoose.model("Products",ProductShema)
