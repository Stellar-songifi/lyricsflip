import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsUUID,
  IsEnum,
  Min,
  MinLength,
} from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
import { UserRole } from '@app/common/enums/role.enum';

export class UserDTO {
  @IsUUID()
  @IsOptional()
  @Expose()
  id?: string; // Optional: Assigned automatically upon creation

  // Common Attributes across the 3 users
  @IsString()
  @IsNotEmpty({ message: 'Username/Name is required' })
  @MinLength(3, { message: 'Username/Name must be at least 3 characters long' })
  @Expose()
  username: string; // Common attribute, can be used for both username and name

  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @Expose()
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Exclude({ toPlainOnly: true }) // hides password when converting the object to plain data
  password: string;

  @IsString()
  @IsOptional()
  @Expose()
  avatar?: string; // Optional: Profile picture URL

  @IsNumber()
  @Min(0, { message: 'Tokens cannot be negative' })
  @Expose()
  tokens: number;

  // Admin Attributes
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Admin tokens cannot be negative' })
  @Expose()
  adminTokens?: number; // Attribute specific to Admin

  // Player Attributes
  @IsString()
  @IsOptional()
  @Expose()
  firstname?: string; // Player-specific attribute

  @IsString()
  @IsOptional()
  @Expose()
  lastname?: string; // Player-specific attribute

  @IsNumber()
  @Min(0, { message: 'Score cannot be negative' })
  @Expose()
  totalScore?: number;

  @IsNumber()
  @Min(0, { message: 'Games played cannot be negative' })
  @Expose()
  gamesPlayed?: number;

  @IsNumber()
  @Min(0, { message: 'Games won cannot be negative' })
  @Expose()
  gamesWon?: number;

  @IsNotEmpty()
  @IsEnum(UserRole) //ENUM for user roles
  @Expose()
  role: UserRole; // Role of a specific user 

  @Expose()
  createdAt?: Date; // Optional: Automatically set on creation

  @Expose()
  updatedAt?: Date; // Optional: Automatically set on updates
}
