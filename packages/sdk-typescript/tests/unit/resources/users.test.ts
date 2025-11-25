import { Users } from '../../../src/resources/users';
import { HTTPClient } from '../../../src/client/http-client';
import { mockUser } from '../../setup';

describe('Users Resource', () => {
  let users: Users;
  let mockHttpClient: jest.Mocked<HTTPClient>;

  beforeEach(() => {
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    } as any;

    users = new Users(mockHttpClient);
  });

  describe('me', () => {
    it('should fetch current user profile', async () => {
      mockHttpClient.get.mockResolvedValue(mockUser);

      const result = await users.me();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/users/me');
      expect(result).toEqual(mockUser);
    });
  });

  describe('get', () => {
    it('should fetch user by id', async () => {
      mockHttpClient.get.mockResolvedValue(mockUser);

      const result = await users.get('usr_123');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/users/usr_123');
      expect(result).toEqual(mockUser);
    });
  });

  describe('update', () => {
    it('should update user profile', async () => {
      const updateParams = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, name: 'Updated Name' };
      mockHttpClient.put.mockResolvedValue(updatedUser);

      const result = await users.update('usr_123', updateParams);

      expect(mockHttpClient.put).toHaveBeenCalledWith('/users/usr_123', updateParams);
      expect(result).toEqual(updatedUser);
    });

    it('should update multiple fields', async () => {
      const updateParams = {
        name: 'New Name',
        email: 'newemail@example.com',
      };
      const updatedUser = {
        ...mockUser,
        name: 'New Name',
        email: 'newemail@example.com',
      };
      mockHttpClient.put.mockResolvedValue(updatedUser);

      const result = await users.update('usr_123', updateParams);

      expect(result.name).toBe('New Name');
      expect(result.email).toBe('newemail@example.com');
    });
  });

  describe('list', () => {
    it('should fetch all users', async () => {
      const usersList = [mockUser, { ...mockUser, id: 'usr_456' }];
      mockHttpClient.get.mockResolvedValue(usersList);

      const result = await users.list();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/users');
      expect(result).toEqual(usersList);
    });
  });
});
