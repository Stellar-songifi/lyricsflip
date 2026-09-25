// src/store/store.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([StoreItem, Transaction, Inventory]),
    UserModule,
  ],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}