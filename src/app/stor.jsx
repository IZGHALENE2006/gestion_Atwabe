import { configureStore } from "@reduxjs/toolkit";
import reducerRejister from '../slices/sliceLogin'
import LoginAdminSlic from '../slices/SliceLoginAdmin'
import ProductSlice from '../slices/SliceProduct'
import ReducerCateroy from '../slices/SilceCategory'
import ReducerEmploye from '../slices/sliceEmploye'
import Fournisseur from '../slices/SliceFournisseur'
import  UserCriditeSlice from '../slices/SliceCridite'
export const Store = configureStore(
    {
        reducer:{
         register:reducerRejister,
         LoginAdmin:LoginAdminSlic,
         Product:ProductSlice,
         category:ReducerCateroy,
         Employe:ReducerEmploye,
         Fournisseur: Fournisseur,
         userCridite:UserCriditeSlice

        }
    }
)