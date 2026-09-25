/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './providers/auth.service';
import { SignInDto } from './dtos/signIn.dto';
import { UserDTO } from './../user/dtos/create-user.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { AuthThrottle } from '../common/throttler/throttle-limits';


@ApiTags('auth') // Groups all endpoints under the 'auth' tag in Swagger
@Controller('auth')
@AuthThrottle() // Stricter limit for every /auth/* route
export class AuthController {
  constructor(
    // Injecting AuthService
    private readonly authService: AuthService,
  ) {}

  @Post('sign-in')
  @ApiOperation({
    summary: 'Sign in a user',
    description: 'Authenticates a user and returns an access token if the credentials are valid.',
  })
  @ApiResponse({ status: 200, description: 'User signed in successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiBody({
    description: 'Login credentials including email and password.',
    type: SignInDto,
    examples: {
      example: {
        summary: 'Valid login credentials',
        value: {
          email: 'user@example.com',
          password: 'password123',
        },
      },
    },
  })
  public async signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  @Post('sign-up')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({
    summary: 'Sign up a new user',
    description: 'Registers a new user and returns the user details upon successful registration.',
  })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid user input data.' })
  @ApiBody({
    description: 'User details required for registration.',
    type: UserDTO,
    examples: {
      example: {
        summary: 'Valid user details',
        value: {
          name: 'John Doe',
          email: 'john.doe@example.com',
          password: 'securePassword123',
        },
      },
    },
  })
  public async createUser(@Body() UserDTO: UserDTO) {
    return await this.authService.signUp(UserDTO);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token.' })
  @ApiBody({ type: RefreshTokenDto })
  public async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('forgot-password')
@Public()
@Throttle({ default: { limit: 3, ttl: 60_000 } })
@ApiOperation({ summary: 'Request password reset' })
@ApiResponse({ status: 200, description: 'Reset email sent.' })
@ApiBody({ type: ForgotPasswordDto })
async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
  return this.authService.forgotPassword(forgotPasswordDto.email);
}

@Post('reset-password')
@Public()
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@ApiOperation({ summary: 'Reset password' })
@ApiResponse({ status: 200, description: 'Password reset successful.' })
@ApiBody({ type: ResetPasswordDto })
async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
  return this.authService.resetPassword(
    resetPasswordDto.token,
    resetPasswordDto.newPassword,
  );
}
}
