const dashboardRepository = require('../repositories/dashboard.repository');
const { sendSuccess } = require('../utils/response.helper');

class DashboardController {
    getStats = async (req, res, next) => {
        try {
            // Fetch everything in parallel to make it dynamic and fast
            const [
                stats, 
                recentOrders, 
                orderStatusDist, 
                paymentDist, 
                categoryDist, 
                performanceVelocity,
                revenueVelocity,
                bestSellers
            ] = await Promise.all([
                dashboardRepository.getStats(),
                dashboardRepository.getRecentOrders(5),
                dashboardRepository.getOrderTypeDistribution(),
                dashboardRepository.getPaymentMethodDistribution(),
                dashboardRepository.getCategoryDistribution(),
                dashboardRepository.getMonthlyOrderDistribution(),
                dashboardRepository.getMonthlyRevenueDistribution(),
                dashboardRepository.getBestSellers(5)
            ]);

            sendSuccess(res, 'Dashboard stats retrieved', { 
                stats, 
                recentOrders, 
                distribution: orderStatusDist,
                paymentDistribution: paymentDist,
                categoryDistribution: categoryDist,
                performanceVelocity: performanceVelocity,
                revenueVelocity: revenueVelocity,
                bestSellers: bestSellers
            });
        } catch (error) {
            next(error);
        }
    };

    getRevenueReport = async (req, res, next) => {
        try {
            const days = parseInt(req.query.days) || 30;
            const report = await dashboardRepository.getRevenueReport(days);
            sendSuccess(res, 'Revenue report retrieved', report);
        } catch (error) {
            next(error);
        }
    };

    getPaymentStats = async (req, res, next) => {
        try {
            const stats = await dashboardRepository.getPaymentIntelligence();
            sendSuccess(res, 'Payment intelligence stats retrieved', stats);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new DashboardController();
