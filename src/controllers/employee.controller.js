const userRepository = require('../repositories/user.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');
const bcrypt = require('bcryptjs');

class EmployeeController {
    /**
     * Get All Employees
     */
    getAll = async (req, res, next) => {
        try {
            const { page, limit, search, role } = req.query;
            const result = await userRepository.findAll(page, limit, { search, role, isEmployee: true });
            
            sendSuccess(res, 'Employees retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Employee By ID
     */
    getById = async (req, res, next) => {
        try {
            const employee = await userRepository.findById(req.params.id);
            if (!employee) return next(new AppError('No employee found with that ID', 404));

            // NEVER send hashed passwords back to the client
            delete employee.password;

            sendSuccess(res, 'Employee retrieved successfully', employee);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Employee
     */
    create = async (req, res, next) => {
        try {
            const { password } = req.body;
            const hashedPassword = await bcrypt.hash(password, 12);
            
            const employeeId = await userRepository.create({
                ...req.body,
                password: hashedPassword
            });

            const newEmployee = await userRepository.findById(employeeId);
            sendSuccess(res, 'Employee created successfully', newEmployee, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Employee
     */
    update = async (req, res, next) => {
        try {
            if (req.body.password) {
                req.body.password = await bcrypt.hash(req.body.password, 12);
                await userRepository.updatePassword(req.params.id, req.body.password);
                delete req.body.password;
            }

            const updated = await userRepository.updateProfile(req.params.id, req.body);
            if (!updated) return next(new AppError('No employee found with that ID', 404));

            const employee = await userRepository.findById(req.params.id);
            sendSuccess(res, 'Employee updated successfully', employee);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Employee (Suspend)
     */
    delete = async (req, res, next) => {
        try {
            await userRepository.updateProfile(req.params.id, { status: 'suspended' });
            sendSuccess(res, 'Employee suspended successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new EmployeeController();
