import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { AuthService } from './../../auth/providers/auth.service';
import { FindOneUserByEmailProvider } from './find-one-user-by-email.provider';
import { User } from '../user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserProvider } from './create-user.services';
import { UserDTO } from '../dtos/create-user.dto';
// Service responsible for handling user operations.
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,

    //Inject findoneuserbyemailprovider
    private readonly findOneUserByEmailProvider: FindOneUserByEmailProvider,
    /*
     * Inject user repository
     */
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    //Inject create user provider
    private readonly createUserProvider: CreateUserProvider,
  ) {}

  public async getAll(limit: number, page: number): Promise<User[]> {
    const skip = (page - 1) * limit;

    return this.userRepository.find({
      skip,
      take: limit,
    });
  }

  async createUser(userData: any) {
    // Never log userData itself: it carries the plaintext password.
    this.logger.log(`Creating new user: ${userData?.email ?? 'unknown'}`);

    try {
      // User creation logic
    } catch (error) {
      this.logger.error(`Failed to create user: ${error.message}`, error.stack);
      throw error;
    }
  }

  public async findUserByEmail(email: string) {
    return await this.findOneUserByEmailProvider.findOneUserByEmail(email);
  }

  public FindOneById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }
  //update password

  public async updateUserPassword(
    userId: string,
    hashedPassword: string,
  ): Promise<void> {
    await this.userRepository.update(userId, { password: hashedPassword });
  }

  // Placeholder for user-related business logic
  // Sign up a user.
  public async signUp(userDto: UserDTO) {
    // Implement sign up logic
    return await this.createUserProvider.createUsers(userDto);
  }

  public async findUser(id: string) {
    try {
      this.logger.log(`Finding user with id: ${id}`);
      // ... find user logic
    } catch (error) {
      this.logger.error(`Error finding user: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Sign in a user.
  signIn() {
    // Implement sign in logic
    return 'userService: Sign-in logic placeholder';
  }

  // Retrieve refresh token.
  refreshToken() {
    // Implement token refresh logic
    return 'userService: Refresh token logic placeholder';
  }
  // Update user profile.
  updateProfile() {
    // Implement profile update logic
    return 'userService: Update profile logic placeholder';
  }

  //Reward system integration
  async completeLesson(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    user.points += 10;
    return this.userRepository.save(user);
  }
}
