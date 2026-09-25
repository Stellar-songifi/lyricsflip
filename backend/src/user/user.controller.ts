import {
  Controller,
  Post,
  Put,
  Body,
  Get,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { UserService } from './providers/user.service';
import { UserDTO } from './dtos/create-user.dto';
import { AccessTokenGuard } from 'src/auth/guard/access-token/access-token.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/role.enum';
//import { SignInDTO } from './dtos/sign-in.dto';
//import { UpdateProfileDTO } from './dtos/update-profile.dto';
//import { RefreshTokenDTO } from './dtos/refresh-token.dto';

// Controller for managing user operations.
@ApiTags('user')
@Controller('user')
@UseGuards(RolesGuard) // guards to restrict specific User access to some routes
export class UserController {
  constructor(
    private readonly userService: UserService, //dependency injection of userService
  ) {}

  //get users
  @Get()
  public getUsers(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.userService.getAll(limit, page);
  }

  // Sign up a new user
  @Post('signup')
  @ApiOperation({
    summary: 'Sign up a new user',
    description: 'Create a new user account',
  })
  @ApiBody({ type: UserDTO })
  @ApiResponse({
    status: 201,
    description: 'User successfully created',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input',
  })
  signUp(@Body() userDto: UserDTO) {
    return this.userService.signUp(userDto);
  }

  // Sign In a user
  @Post('signin')
  @ApiOperation({
    summary: 'Sign in a user',
    description: 'Authenticate user credentials',
  })
  // @ApiBody({ type: SignInDTO })
  @ApiResponse({
    status: 200,
    description: 'User successfully signed in',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  signIn() {
    return this.userService.signIn();
  }

  // Retrieve user refresh access token
  @UseGuards(AccessTokenGuard)
  @Post('refresh-token')
  @ApiOperation({
    summary: 'Refresh user access token',
    description: 'Generate a new access token using refresh token',
  })
  //@ApiBody({ type: RefreshTokenDTO })
  @ApiResponse({
    status: 200,
    description: 'Access token successfully refreshed',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
  })
  refreshToken() {
    return this.userService.refreshToken();
  }

  // GET
  @Get('admin')
  @Roles(UserRole.ADMIN)
  getAdminData() {
    // should return the logic of admin from userService
    return 'this returns admin roles ';
  }

  @Get('admin/:id')
  @Roles(UserRole.ADMIN)
  getAdminById(@Param('id') id: number) {
    // should return the logic of admin from userService
    return 'this returns single admin by his ID ';
  }

  @Get('admins')
  @Roles(UserRole.ADMIN)
  getAllAdmins() {
    // should return the logic of admin from userService
    return 'this returns all admins  ';
  }

  @Put('admin/:id')
  @Roles(UserRole.ADMIN)
  updateAdminById(@Param('id') id: number, @Body() userDto: UserDTO) {
    // should return the logic of admin from userService
    return 'this updates an  admin ';
  }

  @Delete('admin/:id')
  @Roles(UserRole.ADMIN)
  deleteAdminById(@Param('id') id: number) {
    // should return the logic of admin from userService
    return 'this deletes an admin ';
  }

  @Get('player')
  @Roles(UserRole.PLAYER)
  getPlayerData() {
    // should return the logic of player from userService
    return 'this returns player specific roles ';
  }

  @Get('player/:id')
  @Roles(UserRole.PLAYER)
  getPlayerById(@Param('id') id: number) {
    // should return the logic of player from userService
    return 'this returns a single player ';
  }

  @Get('players')
  @Roles(UserRole.PLAYER)
  getAllPlayers() {
    // should return the logic of player from userService
    return 'this returns all players ';
  }

  @Put('player/:id')
  @Roles(UserRole.PLAYER)
  updatePlayerById(@Param('id') id: number, @Body() userDto: UserDTO) {
    // should return the logic of player from userService
    return 'this edits a single player ';
  }

  @Delete('player/:id')
  @Roles(UserRole.PLAYER)
  deletePlayerById(@Param('id') id: number) {
    // should return the logic of player from userService
    return 'this deletes a player ';
  }

  //USERS ROUTES
  @Get('user')
  @Roles(UserRole.USER)
  getViewerData() {
    // should return the logic of user from userService
    return 'this returns  all viewers ';
  }

  @Get('user/:id')
  @Roles(UserRole.USER)
  getUserById(@Param('id') id: number) {
    // should return the logic of user from userService
    return 'this returns  a single user ';
  }

  @Get('users')
  @Roles(UserRole.USER)
  getAllUsers() {
    // should return the logic of user from userService
    return 'this returns  all users ';
  }

  @Put('user/:id')
  @Roles(UserRole.USER)
  updateUserById(@Param('id') id: number, @Body() userDto: UserDTO) {
    // should return the logic of user from userService
    return 'this updates a users ';
  }

  @Delete('user/:id')
  @Roles(UserRole.USER)
  deleteUserById(@Param('id') id: number) {
    // should return the logic of user from userService
    return 'this deletes a single users ';
  }

  // Update user profile
  @UseGuards(AccessTokenGuard)
  @Put('profile')
  @ApiOperation({
    summary: 'Update user profile',
    description: 'Modify user profile information',
  })
  // @ApiBody({ type: UpdateProfileDTO })
  @ApiResponse({
    status: 200,
    description: 'Profile successfully updated',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid profile data',
  })
  updateProfile() {
    return this.userService.updateProfile();
  }
}
