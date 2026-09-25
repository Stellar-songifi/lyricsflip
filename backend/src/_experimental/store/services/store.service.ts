// src/store/services/store.service.ts
@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(StoreItem)
    private storeItemRepository: Repository<StoreItem>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Inventory)
    private inventoryRepository: Repository<Inventory>,
    private userService: UserService
  ) {}

  async createItem(createItemDto: CreateItemDto): Promise<StoreItem> {
    const item = this.storeItemRepository.create(createItemDto);
    return this.storeItemRepository.save(item);
  }

  async getItems(filter?: any): Promise<StoreItem[]> {
    return this.storeItemRepository.find({
      where: { isActive: true, ...filter }
    });
  }

  async purchaseItem(userId: string, purchaseDto: PurchaseDto): Promise<Transaction> {
    const user = await this.userService.findOne(userId);
    const item = await this.storeItemRepository.findOne({
      where: { id: purchaseDto.itemId }
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Check user balance
    if (user.balance < item.price * purchaseDto.quantity) {
      throw new BadRequestException('Insufficient funds');
    }

    // Create transaction
    const transaction = this.transactionRepository.create({
      user,
      item,
      amount: item.price * purchaseDto.quantity,
      currency: 'COINS'
    });

    // Update user balance
    await this.userService.updateBalance(
      userId,
      -item.price * purchaseDto.quantity
    );

    // Update or create inventory
    await this.updateInventory(user, item, purchaseDto.quantity);

    return this.transactionRepository.save(transaction);
  }

  private async updateInventory(
    user: User,
    item: StoreItem,
    quantity: number
  ): Promise<void> {
    let inventory = await this.inventoryRepository.findOne({
      where: { user: { id: user.id }, item: { id: item.id } }
    });

    if (inventory) {
      inventory.quantity += quantity;
      await this.inventoryRepository.save(inventory);
    } else {
      inventory = this.inventoryRepository.create({
        user,
        item,
        quantity
      });
      await this.inventoryRepository.save(inventory);
    }
  }

  async getTransactionHistory(userId: string): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { user: { id: userId } },
      relations: ['item'],
      order: { createdAt: 'DESC' }
    });
  }

  async getInventory(userId: string): Promise<Inventory[]> {
    return this.inventoryRepository.find({
      where: { user: { id: userId } },
      relations: ['item']
    });
  }
}