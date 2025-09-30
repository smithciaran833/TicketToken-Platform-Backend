// Add this register method to AuthService class in auth.service.ts

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<{ user: Partial<User>; tokens: { accessToken: string; refreshToken: string } }> {
    const email = data.email.toLowerCase();
    
    // Check if user exists
    const existingUser = await db('users')
      .where('email', email)
      .whereNull('deleted_at')
      .first();
      
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }
    
    // Hash password
    const passwordHash = await argon2.hash(data.password);
    
    // Create user (without is_active and verification_token which don't exist)
    const [user] = await db('users').insert({
      email: email,
      password_hash: passwordHash,
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone,
      email_verified: false,
      created_at: new Date(),
    }).returning('*');
    
    // Get the user role
    const userRole = await db('roles')
      .where('name', 'user')
      .whereNull('deleted_at')
      .first();
      
    if (userRole) {
      // Assign role
      await db('user_roles').insert({
        user_id: user.id,
        role_id: userRole.id,
        created_at: new Date(),
      });
    }
    
    // Generate tokens
    const tokens = await this.jwtService.generateTokenPair(user);
    
    return {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        email_verified: user.email_verified,
      },
      tokens,
    };
  }
