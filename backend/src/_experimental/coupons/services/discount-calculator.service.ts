// src/coupons/services/discount-calculator.service.ts
import { Injectable } from '@nestjs/common';
import { Coupon, DiscountType } from '../entities/coupon.entity';
import { CartItem } from '../../cart/entities/cart-item.entity';
import { StoreItem } from '../../store/entities/store-item.entity';

export interface DiscountResult {
  totalDiscount: number;
  itemDiscounts: {
    itemId: string;
    originalPrice: number;
    discountedPrice: number;
    discountAmount: number;
  }[];
  discountBreakdown: string;
}

@Injectable()
export class DiscountCalculatorService {
  calculateDiscount(
    coupon: Coupon,
    cartItems: CartItem[],
  ): DiscountResult {
    let totalDiscount = 0;
    const itemDiscounts = [];
    let discountBreakdown = '';

    // If coupon only applies to specific items, filter the cart
    let applicableItems = cartItems;
    if (!coupon.isGlobal && coupon.applicableItems.length > 0) {
      const applicableItemIds = coupon.applicableItems.map(item => item.id);
      applicableItems = cartItems.filter(item => 
        applicableItemIds.includes(item.storeItem.id)
      );
    }

    switch (coupon.discountType) {
      case DiscountType.PERCENTAGE: {
        const percentageDiscount = coupon.discountValue / 100;
        
        for (const item of applicableItems) {
          const itemTotal = item.quantity * item.storeItem.price;
          const itemDiscount = itemTotal * percentageDiscount;
          
          totalDiscount += itemDiscount;
          itemDiscounts.push({
            itemId: item.storeItem.id,
            originalPrice: item.storeItem.price,
            discountedPrice: item.storeItem.price * (1 - percentageDiscount),
            discountAmount: itemDiscount / item.quantity, // Per unit discount
          });
        }
        
        discountBreakdown = ${coupon.discountValue}% off${coupon.isGlobal ? ' everything' : ' selected items'};
        break;
      }
      
      case DiscountType.FIXED_AMOUNT: {
        // For fixed amount, apply to cart total
        const fixedDiscount = coupon.discountValue;
        
        // Distribute the discount proportionally across applicable items
        const applicableTotal = applicableItems.reduce(
          (sum, item) => sum + (item.quantity * item.storeItem.price), 
          0
        );
        
        for (const item of applicableItems) {
          const itemTotal = item.quantity * item.storeItem.price;
          const proportion = itemTotal / applicableTotal;
          const itemDiscount = fixedDiscount * proportion;
          
          totalDiscount += itemDiscount;
          itemDiscounts.push({
            itemId: item.storeItem.id,
            originalPrice: item.storeItem.price,
            discountedPrice: item.storeItem.price - (itemDiscount / item.quantity),
            discountAmount: itemDiscount / item.quantity, // Per unit discount
          });
        }
        
        discountBreakdown = ${fixedDiscount} off total purchase;
        break;
      }
      
      case DiscountType.BUY_X_GET_Y: {
        // Implement buy X get Y logic
        if (coupon.buyQuantity && coupon.getQuantity) {
          for (const item of applicableItems) {
            const { quantity, storeItem } = item;
            const { price } = storeItem;
            
            // Calculate how many sets of "buy X get Y" are in the cart
            const sets = Math.floor(quantity / (coupon.buyQuantity + coupon.getQuantity));
            const freeItems = sets * coupon.getQuantity;
            const itemDiscount = freeItems * price;
            
            totalDiscount += itemDiscount;
            itemDiscounts.push({
              itemId: storeItem.id,
              originalPrice: price,
              discountedPrice: price,
              discountAmount: (itemDiscount / quantity), // Per unit discount
            });
          }
          
          discountBreakdown = Buy ${coupon.buyQuantity} get ${coupon.getQuantity} free;
        }
        break;
      }
      
      case DiscountType.FREE_SHIPPING: {
        // Implement if the system supports shipping fees
        // For now, just add 0 discount
        discountBreakdown = 'Free shipping';
        break;
      }
    }

    // Apply maximum discount amount if specified
    if (coupon.maximumDiscountAmount && totalDiscount > coupon.maximumDiscountAmount) {
      // Proportion the reduction across all items
      const reductionFactor = coupon.maximumDiscountAmount / totalDiscount;
      
      totalDiscount = coupon.maximumDiscountAmount;
      
      for (const discount of itemDiscounts) {
        discount.discountAmount *= reductionFactor;
        discount.discountedPrice = discount.originalPrice - discount.discountAmount;
      }
      
      discountBreakdown += ` (maximum discount of ${coupon.maximumDiscountAmount} applied)`;
    }

    return {
      totalDiscount,
      itemDiscounts,
      discountBreakdown,
    };
  }
}
