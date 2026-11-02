# Devis, bons de livraison, bons de retour et avoirs

Ces documents sont stockés dans la collection `SalesDocument`, séparément des
factures et des ventes. Ils ne génèrent ni règlement ni bénéfice. Les devis et
avoirs sont des documents enregistrables et imprimables, sans mouvement de stock
ni remboursement automatique. L'API refuse `updateStock: true` pour ces deux types.

Par défaut, leur enregistrement ne modifie pas le stock. L'option « Mettre à jour
le stock » déduit les quantités d'un bon de livraison et ajoute celles d'un bon
de retour. La modification du stock et la création du bon utilisent une même
transaction MongoDB : il faut un replica set ou un cluster prenant en charge les
transactions, par exemple MongoDB Atlas. Un serveur MongoDB standalone ne permet
que l'enregistrement sans mouvement de stock ; une tentative avec l'option cochée
est refusée sans enregistrer le bon.

`GET /sales-documents` liste les documents du magasin pour l'administrateur et les
documents créés par l'employé pour ce dernier. `POST /sales-documents` accepte les types
`quote`, `delivery`, `return` et `credit`, avec les préfixes `DEV`, `BL`, `BR` et
`AV`. Les deux routes nécessitent l'authentification existante.
Chaque formulaire fournit un `requestId` stable : une répétition du même envoi
renvoie le bon existant, sans répéter son mouvement de stock.

Les quantités des bons de retour s'affichent négatives dans le tableau des
produits et le récapitulatif, en aperçu, impression et PDF, y compris pour les
anciens bons. Les quantités enregistrées restent positives pour les calculs et
la remise en stock.

Vérification depuis la racine :

```sh
node --test tests/salesDocuments.test.js tests/invoicePdf.test.js tests/receiptDiscount.test.js
```

Les tests du contrôleur utilisent des modèles et sessions simulés ; ils ne se
connectent pas à la base du client.
